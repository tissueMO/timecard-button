#include <M5StickC.h>
#include <WiFiClientSecure.h>
#include "settings.h"

// ネットワーク設定
const char *ssid = SSID;
const char *password = PASSWORD;
const char *host = HOSTNAME;
const char *apiKey = API_KEY;
const int port = PORT;
const int CONNECTION_TIMEOUT_MILLIS = 5000;
const int RESPONSE_TIMEOUT_MILLIS = 20000;

// LCD描画設定
const int displayBrightness = 10;
const int displayRotation = 1;
const int displayTextSize = 2;

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
  M5.Lcd.print("Init...");

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
  M5.Lcd.println("OK");
  M5.Lcd.println("IP:");
  M5.Lcd.println(WiFi.localIP());

  delay(1000);
  clearLcd();
  M5.Lcd.println("TIMECARD");
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
    M5.Lcd.println("TIMECARD");
  }

  delay(1);
}

/**
 * タイムカードを打刻します。
 */
void postTimecard()
{
#if PORT == 443
  WiFiClientSecure client;
#else
  WiFiClient client;
#endif

  clearLcd();
  M5.Lcd.println("TIMECARD...");
  Serial.print("Connecting to ");
  Serial.println(host);
  if (!client.connect(host, port, CONNECTION_TIMEOUT_MILLIS))
  {
    // HTTP通信の確立に失敗
    Serial.println("Connection failed.");
    M5.Lcd.println("<<ERROR>>");
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
      client.stop();
      Serial.println("...Connection timeout.");
      M5.Lcd.println("<<TIMEOUT>>");
      delay(3000);
      return;
    }
  }

  M5.Lcd.println("<<DONE>>");
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
