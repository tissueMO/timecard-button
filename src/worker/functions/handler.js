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
    const result = {
      statusCode: 400,
      body: `データベースに登録されていないユーザーでタイムカードを打刻しようとしました: ${email}`,
    };
    console.error(result);
    return result;
  }

  if (user.api_key !== apiKey) {
    const result = {
      statusCode: 400,
      body: `APIキーが不正です: (${email}) ${apiKey}`,
    };
    console.error(result);
    return result;
  }

  // 【取扱注意】勤怠システムのパスワードを取得
  const password = (await ssm.getParameter({
    Name: user.kintai_password_ssm_parameter_name,
    WithDecryption: true,
  }).promise())?.Parameter?.Value;

  if (!password) {
    const result = {
      statusCode: 400,
      body: `勤怠システムのパスワードが登録されていません: ${email}`,
    };
    console.error(result);
    return result;
  }

  const options = {
    username: user.kintai_username,
    password,
  };

  try {
    console.info('タイムカードの打刻操作を開始します...', email, options.username);

    const timecardResult = await executeOnKintai(timecard, options);

    console.info(`タイムカード【${timecardResult}】打刻しました:`, email);
    const publishResult = await sns.publish({
      TopicArn: snsTopic,
      Subject: `【${timecardResult}】タイムカード打刻完了`,
      Message: `タイムカード【${timecardResult}】打刻しました。\n`,
      MessageAttributes: {
        to: {
          DataType: 'String',
          StringValue: email,
        },
      },
    }).promise();
    console.log(publishResult);

    const result = {
      statusCode: 200,
      result: timecardResult,
    };
    console.info(result);
    return result;

  } catch (e) {
    console.error(e);

    const publishResult = await sns.publish({
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
    console.log(publishResult);

    const result = {
      statusCode: 500,
      error: e,
    };
    console.error(result);
    return result;
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
  const browser = await chromium.launch({
    // Dockerコンテナー型のLambda関数における制約の対策
    executablePath: getCustomExecutablePath(chromium.executablePath()),
    args: [ '--single-process' ],
  });
  const context = await browser.newContext({
    locale: 'ja',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  console.log('Chromium: ログインページへ遷移します...');
  await page.goto(kintaiUrl);

  // ログイン
  console.log('Chromium: ログインします...');
  (await page.$('input[name="username"]')).fill(username);
  (await page.$('input[name="password"]')).fill(password);
  await page.click('input[name="submit1"]');

  // 共通フレームページへ
  console.log('Chromium: 共通フレームページへ遷移します...');
  await page.goto(`${kintaiUrl}/common/mainframe.asp`);

  // 任意の処理を実行
  console.log('Chromium: 任意の処理を実行します...');
  let result = null;
  if (callback) {
    result = await callback(page, options);
  }

  // ログアウト
  console.log('Chromium: ログアウトします...');
  await page.goto(`${kintaiUrl}/common/logout.asp`);
  await browser.close();

  return result;
};

/**
 * Dockerイメージビルド時点で確定しているブラウザーの実行可能パスを返します。
 * @param {*} expectedPath ブラウザーの標準実行パス
 * @returns {string}
 */
const getCustomExecutablePath = (expectedPath) => {
  console.log('expectedPath:', expectedPath);
  const suffix = expectedPath.split('/.cache/ms-playwright/')[1];
  return `/home/pwuser/.cache/ms-playwright/${suffix}`;
}
