#include <M5StickC.h>
#include <WiFiClientSecure.h>
#include "settings.h"

// ネットワーク設定
const char *ssid = SSID;
const char *password = PASSWORD;
const char *host = HOSTNAME;
const char *apiKey = API_KEY;
const int port = PORT;
const int RESPONSE_TIMEOUT_MILLIS = 10000;

#if PORT == 443
  WiFiClientSecure client;
#else
  WiFiClient client;
#endif

// LCD描画設定
const int displayBrightness = 10;
const int displayRotation = 1;
const int displayTextSize = 1;

// 関数プロトタイプ宣言
void postTimecard();
void clearLcd();

/*
  初回処理
*/
void setup()
{
  // M5StickC 初期化
  M5.begin();

  // LCD スクリーン初期化
  M5.Axp.ScreenBreath(displayBrightness);
  M5.Lcd.setRotation(displayRotation);
  M5.Lcd.setTextSize(displayTextSize);
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.println("Timecard Button");

  // Wi-Fi 接続
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED)
  {
    // 接続待ち
    delay(500);
    Serial.print(".");
  }

  // 接続成功後
  Serial.println();
  Serial.println("Wi-Fi connected.");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  M5.Lcd.print("IP address: ");
  M5.Lcd.println(WiFi.localIP());

  delay(1000);
  clearLcd();
  M5.Lcd.println("READY.");
}

/*
  ループ処理
*/
void loop()
{
  M5.update();

  if (M5.BtnA.wasPressed())
  {
    postTimecard();

    clearLcd();
    M5.Lcd.println("READY.");
  }

  delay(1);
}

/**
 * タイムカードを打刻します。
 */
void postTimecard()
{
  clearLcd();
  M5.Lcd.println("Timecard: Connecting...");
  Serial.print("Connecting to ");
  Serial.println(host);
  if (!client.connect(host, port))
  {
    // HTTP通信の確立に失敗
    Serial.println("Connection failed.");

    clearLcd();
    M5.Lcd.println("Timecard: Connection failed.");
    delay(3000);
    return;
  }

  // リクエスト生成
  String url = String("/prod/timecard/") + apiKey;
  Serial.print("Requesting URL: ");
  Serial.print(host);
  Serial.println(url);

  // POST リクエスト実行
  String request =
      String("POST ") + url + " HTTP/1.1\r\n" +
      "Host: " + host + "\r\n" +
      "Connection: close\r\n" +
      "Content-Length: 0\r\n" +
      "\r\n";
  client.print(request);

  // レスポンス返却まで待機
  const unsigned long requestedTime = millis();
  while (!client.available())
  {
    if (millis() - requestedTime > RESPONSE_TIMEOUT_MILLIS)
    {
      Serial.println("...Connection timeout.");
      client.stop();

      clearLcd();
      M5.Lcd.println("Timecard: Connection timeout.");
      delay(3000);
      return;
    }
  }

  clearLcd();
  M5.Lcd.println("Timecard: DONE.");
  delay(3000);
}

/**
 * LCDを暗転させます。
 */
void clearLcd()
{
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setCursor(0, 0);
}
