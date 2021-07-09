const fs = require('fs').promises;
const yaml = require('js-yaml');
const jose = require('node-jose');
const crypto = require('crypto');
const qs = require('querystring');
const axios = require('axios');
const aws = require('aws-sdk');
const ssm = new aws.SSM();
const lambda = new aws.Lambda();

const commons = require('../commons/handler');
const workers = require('../workers/handler');

const serviceName = process.env.service_name;
const stage = process.env.stage;
const apiGatewayUrl = process.env.apigateway_url;
const cognitoBaseUrl = process.env.cognito_base_url;
const cognitoClientId = process.env.cognito_client_id;
const cognitoClientSecret = process.env.cognito_client_secret;
const cognitoCallbackUri = `${apiGatewayUrl}/oauth2callback`;
const dbRegion = process.env.db_region;
const dbEndpoint = process.env.db_endpoint;
const kmsKeyId = process.env.kms_keyid;

const dynamodb = new aws.DynamoDB.DocumentClient(dbRegion ? {
  region: dbRegion,
  endpoint: dbEndpoint,
} : {});

module.exports.vironAuthType = async () => ({
  statusCode: 200,
  headers: {
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify([
    {
      type: 'oauth',
      provider: 'Cognito',
      url: `/${stage}/signin`,
      method: 'POST',
    },
    {
      type: 'signout',
      provider: 'Cognito',
      url: `/${stage}/signout`,
      method: 'POST',
    },
  ]),
});

/**
 * サインインを行います。
 */
module.exports.signIn = async (event) => ({
  statusCode: 302,
  headers: {
    'Access-Control-Allow-Origin': '*',
    Location: `${cognitoBaseUrl}/login?` + qs.stringify({
      client_id: cognitoClientId,
      response_type: 'code',
      redirect_uri: cognitoCallbackUri,
      state: Buffer.from(event.queryStringParameters.redirect_url).toString('base64'),
    }),
  },
});

/**
 * サインアウトを行います。
 */
module.exports.signOut = async () => ({
  statusCode: 302,
  headers: {
    'Access-Control-Allow-Origin': '*',
    Location: `${cognitoBaseUrl}/logout?` + qs.stringify({
      client_id: cognitoClientId,
      redirect_uri: cognitoCallbackUri,
    }),
  },
});

/**
 * 外部認証の結果を適切に処理し、ログインされた状態にします。
 */
module.exports.oauth2Callback = async (event) => {
  const authCode = event.queryStringParameters.code;
  const redirectUrl = Buffer.from(event.queryStringParameters.state, 'base64').toString();

  try {
    const response = await axios.post(
      `${cognitoBaseUrl}/oauth2/token`,
      qs.stringify({
        client_id: cognitoClientId,
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: cognitoCallbackUri,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${cognitoClientId}:${cognitoClientSecret}`).toString('base64')}`,
        },
      }
    );

    const token = response.data.id_token;
    const tokenType = response.data.token_type;
    const authToken = `${tokenType} ${token}`;

    // レスポンスヘッダーにトークンを付与
    return {
      statusCode: 302,
      headers: {
        Authorization: authToken,
        Location: `${redirectUrl}?token=${authToken}`,
        'Access-Control-Allow-Origin': '*',
      },
    };

  } catch (e) {
    console.error('[COGNITO-ERROR]', e);

    return {
      statusCode: 302,
      headers: {
        Location: redirectUrl,
        'Access-Control-Allow-Origin': '*',
      },
    };
  }
};

module.exports.swagger = async () => ({
  statusCode: 200,
  headers: {
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify(Object.assign(
    yaml.load(await fs.readFile('swagger.yml', 'utf-8')),
    {
      host: (new URL(apiGatewayUrl)).host,
      basePath: `/${stage}`,
    }
  )),
});

module.exports.viron = async () => ({
  statusCode: 200,
  headers: {
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify({
    name: 'タイムカードボタン',
    color: 'white',
    theme: 'standard',
    thumbnail: '',
    tags: ['Timecard'],
    pages: [
      {
        id: 'user',
        name: '勤怠システム接続設定',
        section: 'manage',
        group: '',
        components: [
          {
            name: '設定済みの情報',
            style: 'table',
            primary: 'email',
            table_labels: [
              'email',
            ],
            pagination: false,
            api: {
              path: `/user`,
              method: 'get',
            },
            actions: [
              '/timecard',
            ],
          },
        ],
      }
    ],
  }),
});

module.exports.getUser = async (event) => {
  // 処理の都合上JWTが必須
  const jwtPayload = event.headers.Authorization.split('.')[1];
  if (!jwtPayload) {
    console.error('正規の認証を行っていないユーザーがアクセスしています');
    return {
      statusCode: 401,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    };
  }

  // JWTトークンからメールアドレスを取得
  const loginContext = JSON.parse(jose.util.base64url.decode(jwtPayload));
  const email = loginContext['email'];

  // 本人の設定情報を取得
  const user = (await dynamodb.get({
    TableName: 'users',
    Key: { email },
  }).promise())?.Item;

  if (!user) {
    console.error('データベースに登録されていないユーザーがログインしています:', email);
    return {
      statusCode: 401,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify([
      {
        email: user.email,
        username: user.kintai_username,
        has_password: !!user.kintai_password_ssm_parameter_name,
      },
    ]),
  };
};

module.exports.updateUser = async (event) => {
  const email = qs.unescape(event.pathParameters.email);
  const request = JSON.parse(event.body);

  // 処理の都合上JWTが必須
  const jwtPayload = event.headers.Authorization.split('.')[1];
  if (!jwtPayload) {
    console.error('正規の認証を行っていないユーザーがアクセスしています');
    return {
      statusCode: 401,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    };
  }

  // JWTからメールアドレスを取得
  const loginContext = JSON.parse(jose.util.base64url.decode(jwtPayload));
  const loginUserEmail = loginContext['email'];

  // 本人からのリクエストのみ受理する
  if (email !== loginUserEmail) {
    console.error('本人からのリクエストではありません:', email, loginUserEmail);
    return {
      statusCode: 401,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    };
  }

  // SSM Parameter Store でパスワードをセキュアに保存
  const hashedEmail = crypto.createHash('md5').update(email, 'binary').digest('hex');
  const passwordSsmParameterName = `/${serviceName}/users/${hashedEmail}/password`;
  await ssm.putParameter({
    Name: passwordSsmParameterName,
    Value: request.password,
    Type: 'SecureString',
    KeyId: kmsKeyId,
    Overwrite: true,
  }).promise();

  // DynamoDBのユーザー情報を更新
  const user = (await dynamodb.get({
    TableName: 'users',
    Key: { email },
  }).promise())?.Item;

  await dynamodb.put({
    TableName: 'users',
    Item: {
      email,
      api_key: user.api_key,
      kintai_username: request.username,
      kintai_password_ssm_parameter_name: passwordSsmParameterName,
      subscription_arn: user.subscription_arn,
    }
  }).promise();

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  };
};

module.exports.deleteUser = async (event) => {
  const email = qs.unescape(event.pathParameters.email);

  // 処理の都合上JWTが必須
  const jwtPayload = event.headers.Authorization.split('.')[1];
  if (!jwtPayload) {
    console.error('正規の認証を行っていないユーザーがアクセスしています');
    return {
      statusCode: 401,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    };
  }

  // JWTからメールアドレスを取得
  const loginContext = JSON.parse(jose.util.base64url.decode(jwtPayload));
  const loginUserEmail = loginContext['email'];

  // 本人からのリクエストのみ受理する
  if (email !== loginUserEmail) {
    console.error('本人からのリクエストではありません:', email, loginUserEmail);
    return {
      statusCode: 401,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    };
  }

  // 利用停止の手続きを実行
  return Object.assign(
    await commons.deleteUser({ email }),
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
};

module.exports.timecard = async (event) => {
  // 処理の都合上JWTが必須
  const jwtPayload = event.headers.Authorization.split('.')[1];
  if (!jwtPayload) {
    console.error('正規の認証を行っていないユーザーがアクセスしています');
    return {
      statusCode: 401,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    };
  }

  // JWTからメールアドレスとAPIキーを取得
  const loginContext = JSON.parse(jose.util.base64url.decode(jwtPayload));
  const email = loginContext['email'];
  const apiKey = loginContext['custom:apikey'];

  // タイムカード打刻
  const result = await workers.executeTimecard({ email, apiKey });
  console.log('タイムカード打刻結果:', result);

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  };
};

module.exports.timecardByApiKey = async (event) => {
  const apiKey = qs.unescape(event.pathParameters.api_key);

  // APIキーからユーザーを逆引きする
  const user = (await dynamodb.scan({
    TableName: 'users',
    ExpressionAttributeNames: { '#apikey': 'api_key' },
    ExpressionAttributeValues: { ':apikey': apiKey },
    FilterExpression: '#apikey = :apikey',
  }).promise())?.Items?.[0];

  if (!user) {
    console.error('APIキーが不正です:', apiKey);
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    };
  }

  // タイムカード打刻
  const result = await workers.executeTimecard({
    email: user.email,
    apiKey,
  });
  console.log('タイムカード打刻結果:', result);

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  };
};
