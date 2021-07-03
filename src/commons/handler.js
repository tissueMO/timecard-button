const uuid = require('node-uuid');
const generatePassword = require('generate-password');
const aws = require('aws-sdk');
const ssm = new aws.SSM();
const sns = new aws.SNS();
const cognitoidp = new aws.CognitoIdentityServiceProvider();

const apiGatewayUrl = process.env.apigateway_url;
const cloudFrontUrl = process.env.cloudfront_url;
const cognitoUserPoolId = process.env.cognito_userpool_id;
const dbRegion = process.env.db_region;
const dbEndpoint = process.env.db_endpoint;
const snsTopic = process.env.sns_topic;

const dynamodb = new aws.DynamoDB.DocumentClient(dbRegion ? {
  region: dbRegion,
  endpoint: dbEndpoint,
} : {});

/**
 * ユーザーを新規作成する準備としてSNSサブスクリプションの登録を行います。
 */
module.exports.provisionUser = async (event) => {
  const email = event.email;

  await sns.subscribe({
    TopicArn: snsTopic,
    Protocol: 'email',
    Endpoint: email,
    Attributes: {
      FilterPolicy: {
        to: {
          Type: 'String',
          Value: email,
        },
      },
    },
  }).promise();

  return { statusCode: 200 };
};

/**
 * 指定されたユーザーの新規作成を開始できる状態にあるかどうかを返します。
 */
module.exports.isProvisionedUser = async (event) => {
  const email = event.email;

  const subscriptionArn = (await sns.listSubscriptionsByTopic({ TopicArn: snsTopic }).promise())
    .Subscriptions
    .filter(subscription => subscription.Endpoint === email)
    .SubscriptionArn;

  const provisioned = subscriptionArn !== 'PendingConfirmation';
  return {
    statusCode: 200,
    provisioned,
    subscriptionArn: provisioned ? subscriptionArn : null,
  };
};

/**
 * ユーザーを新規作成します。
 */
module.exports.createUser = async (event) => {
  const email = event.email;
  const subscriptionArn = (await this.isProvisionedUser(event)).subscriptionArn;

  if (!subscriptionArn) {
    return {
      statusCode: 400,
      body: `ユーザーがSNSサブスクリプションの確認を済ませていないため作成手続きを行えません: ${email}`,
    };
  }

  // APIキーを発行し、データベースに書き込む
  const apiKey = uuid.v4();
  await dynamodb.put({
    TableName: 'users',
    Item: {
      email,
      api_key: apiKey,
      kintai_username: '',
      kintai_password_ssm_parameter_name: '',
      subscription_arn: subscriptionArn,
    }
  }).promise();

  // 一時パスワードを発行し、ログインユーザーを作成
  const temporaryPassword = generatePassword.generate({
    length: 12,
    numbers: true,
    lowercase: true,
    uppercase: true,
    symbols: true,
    strict: true,
  });
  await cognitoidp.adminCreateUser({
    UserPoolId: cognitoUserPoolId,
    Username: email,
    TemporaryPassword: temporaryPassword,
    UserAttributes: [
      {
        Name: 'custom:apikey',
        Value: apiKey,
      },
    ],
  }).promise();

  // ユーザーに初期設定を案内するためのSNS通知を行う
  await sns.publish({
    TopicArn: snsTopic,
    Subject: '【タイムカードボタン管理システム】初期設定ガイド',
    Message:
      `${email} さん\n\n` +
      '以下の管理画面から勤怠システムのアカウント情報を入力して下さい。\n\n' +
      '◆管理画面のURL\n' +
      `${cloudFrontUrl}\n\n` +
      '◆管理画面に追加するURL\n' +
      `${apiGatewayUrl}/swagger.json\n\n` +
      '◆管理画面のログイン情報\n' +
      `メールアドレス: ${email}\n` +
      `一時パスワード: ${temporaryPassword}\n` +
      '※ 一時パスワードでログインすると、新しいパスワードへの変更を促されます。変更後のパスワードを忘れないようご注意下さい。\n',
    MessageAttributes: {
      to: {
        DataType: 'String',
        StringValue: email,
      },
    },
  }).promise();

  return {
    statusCode: 200,
    email,
    apiKey,
  };
};

/**
 * ユーザーを削除し、関連するリソースを削除します。
 */
module.exports.deleteUser = async (event) => {
  const email = event.email;

  const user = (await dynamodb.get({
    TableName: 'users',
    Key: { email },
  }).promise())?.Item;

  if (!user) {
    return {
      statusCode: 400,
      body: `データベースに登録されていないユーザーを削除しようとしました: ${email}`,
    };
  }

  // 各種リソース削除
  await cognitoidp.adminDeleteUser({
    UserPoolId: cognitoUserPoolId,
    Username: email,
  }).promise();

  if (user.kintai_password_ssm_parameter_name) {
    await ssm.deleteParameter({
      Name: user.kintai_password_ssm_parameter_name,
    }).promise();
  }

  await sns.unsubscribe({
    SubscriptionArn: user.subscription_arn,
  }).promise();

  await dynamodb.delete({
    TableName: 'users',
    Key: { email },
  }).promise();

  return {
    statusCode: 200,
    body: `ユーザーを削除しました: ${email}`,
  };
};
