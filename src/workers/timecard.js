const { Page } = require('playwright-core');
const aws = require('aws-sdk');
const s3 = new aws.S3();
const fs = require('fs').promises;

module.exports = {
  /**
   * タイムカードを打刻します。
   * @param {Page} page
   * @returns {string}
   */
  timecard: async (page) => {
    // タイムカードページへ移動
    console.log('Chromium: タイムカードページへ遷移します...');
    const sideFrameElement = await page.$('frame[name="oldmenuFrame"]');
    const sideFrame = await sideFrameElement.contentFrame();
    await sideFrame.click('a[href="./work/registtimeend1.asp"]');
    await sideFrame.waitForNavigation();

    const bodyFrameElement = await page.$('frame[name="bodyFrame"]');
    const bodyFrame = await bodyFrameElement.contentFrame();
    await bodyFrame.waitForNavigation()

    // タイムカード打刻
    console.log('Chromium: タイムカードを打刻します...');
    const buttons = await bodyFrame.$$('a[id="today"]');
    await screenshot(page, 'timecard.png');
    if (!buttons.length) {
      await screenshot(page, 'error-timecard.png');
      throw 'タイムカード画面に押下できるボタンがありません。';
    }

    const command = (buttons.length === 4) ? '出勤' : '退勤';

    console.info(`DRYRUN: ${command}`);

    // if (command === '出勤') {
    //   console.info('出勤タイムカードを打刻します。');
    //   await buttons.slice(0, 1).pop().click();
    // } else {
    //   console.info('退勤タイムカードを打刻します。');
    //   await buttons.slice(-1).pop().click();
    // }

    // // 画面が更新されるのを待つ
    // const newBodyFrameElement = await page.$('frame[name="bodyFrame"]');
    // const newBodyFrame = await newBodyFrameElement.contentFrame();
    // await newBodyFrame.waitForNavigation()
    // await newBodyFrame.waitForSelector('a[id="today"]');

    return command;
  },
};

/**
 * [DEBUG] スクリーンショットを取得し、S3にアップロードします。
 * @param {Page} page
 * @param {string} key
 */
const screenshot = async (page, key) => {
  const path = `/tmp/${key}`;
  await page.screenshot({ path });
  await s3.putObject({
    Bucket: 'timecard-manager-prod',
    Key: key,
    Body: await fs.readFile(path),
  }).promise();
};
