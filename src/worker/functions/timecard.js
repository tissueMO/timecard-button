const { Page } = require('playwright');

module.exports = {
  /**
   * タイムカードを打刻します。
   * @param {Page} page
   * @returns {string}
   */
  timecard: async (page) => {
    // タイムカードページへ移動
    const sideFrameElement = await page.$('frame[name="oldmenuFrame"]');
    const sideFrame = await sideFrameElement.contentFrame();
    await sideFrame.click('a[href="./work/registtimeend1.asp"]');

    const bodyFrameElement = await page.$('frame[name="bodyFrame"]');
    const bodyFrame = await bodyFrameElement.contentFrame();
    await bodyFrame.waitForLoadState('load');

    // タイムカード打刻
    const buttons = await bodyFrame.$$('a[id="today"]');
    if (!buttons.length) {
      await page.screenshot({ path: './error-timecard.png' });
      throw 'タイムカード画面に押下できるボタンがありません。';
    }

    const command = (buttons.length === 4) ? '出勤' : '退勤';

    console.info(`<<< ドライラン [${command}] >>>>`);

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
    // await newBodyFrame.waitForLoadState('load');
    // await newBodyFrame.waitForSelector('a[id="today"]');

    return command;
  },
};
