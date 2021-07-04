const { chromium } = require('playwright');
const { timecard } = require('./timecard');
const aws = require('aws-sdk');
const sns = new aws.SNS();
const ssm = new aws.SSM();

const dbRegion = process.env.db_region;
const dbEndpoint = process.env.db_endpoint;
const snsTopic = process.env.sns_topic;
const kintaiUrl = process.env.kintai_url;

const dynamodb = new aws.DynamoDB.DocumentClient(dbRegion ? {
  region: dbRegion,
  endpoint: dbEndpoint,
} : {});

/**
 * 指定のユーザーとして勤怠システムにアクセスし、タイムカードを打刻します。
 */
module.exports.executeTimecard = async (event) => {
  const {email, apiKey} = event;

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
  if (user.api_key !== apiKey) {
    return {
      statusCode: 400,
      body: `APIキーが不正です: (${email}) ${apiKey}`,
    };
  }

  const password = await ssm.getParameter({
    Name: user.kintai_password_ssm_parameter_name,
    WithDecryption: true,
  }).promise()?.Parameter?.Value;

  if (!password) {
    return {
      statusCode: 400,
      body: `勤怠システムのパスワードが登録されていません: ${email}`,
    };
  }

  const options = {
    username: user.kintai_username,
    password,
  };

  try {
    const result = await executeOnKintai(timecard, options);

    await sns.publish({
      TopicArn: snsTopic,
      Subject: `【${result}】タイムカード打刻完了`,
      Message: `タイムカード【${result}】打刻しました。\n`,
      MessageAttributes: {
        to: {
          DataType: 'String',
          StringValue: email,
        },
      },
    }).promise();

    return {
      statusCode: 200,
      result,
    };

  } catch (e) {
    console.error(e);

    await sns.publish({
      TopicArn: snsTopic,
      Subject: 'タイムカード打刻失敗',
      Message:
        'タイムカードの打刻に失敗しました。\n\n' +
        `◆エラー内容\n${e}\n`,
      MessageAttributes: {
        to: {
          DataType: 'String',
          StringValue: email,
        },
      },
    }).promise();

    return {
      statusCode: 500,
      error: e,
    };
  }
};

/**
 * 勤怠システム上で任意の処理を行います。
 * @param {Function} callback
 * @param {Object} options
 * @returns {*}
 */
const executeOnKintai = async (callback, options) => {
  const { username, password } = options;

  // 勤怠システムにアクセス
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'ja',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  await page.goto(kintaiUrl);

  // ログイン
  (await page.$('input[name="username"]')).fill(username);
  (await page.$('input[name="password"]')).fill(password);
  await page.click('input[name="submit1"]');

  // 共通フレームページへ
  await page.goto(`${kintaiUrl}/common/mainframe.asp`);

  // 任意の処理を実行
  let result = null;
  if (callback) {
    result = await callback(page, options);
  }

  // ログアウト
  await page.goto(`${kintaiUrl}/common/logout.asp`);
  await browser.close();

  return result;
};
