const fs = require('fs').promises;
const fetch = require('node-fetch');
const { chromium } = require('playwright');
const { timecard } = require('./timecard');

module.exports.executeTimecard = async event => {
  let result;
  try {
    result = await execute(timecard);
  } catch (e) {
    console.error(e);
    // TODO: SNS通知
    return;
  }

  // TODO: SNS通知
  // `タイムカード [${result}] 打刻しました。`,
  res.send(`${result}`);
};

/**
 * 勤怠システム上で任意の処理を行います。
 *
 * @param {Function} callback
 * @param {Object} options
 */
const execute = async (callback, options) => {
  // 勤怠システムにアクセス
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: 'ja',
    viewport: { width: 1920, height: 1080 },
    recordVideo: record ? {
      dir: '.',
      size: { width: 1920, height: 1080 },
    } : undefined,
  });
  const page = await context.newPage();
  await page.goto(url);

  // ログイン
  (await page.$('input[name="username"]')).fill(user);
  (await page.$('input[name="password"]')).fill(password);
  await page.click('input[name="submit1"]');

  // 共通フレームページへ
  await page.goto(`${url}/common/mainframe.asp`);

  // 任意の処理を呼び出し
  let result = null;
  if (callback) {
    result = await callback(page, options);
  }

  // ログアウト
  await page.goto(`${url}/common/logout.asp`);
  await browser.close();

  return result;
};
