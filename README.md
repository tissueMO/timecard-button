# タイムカードボタン

## Summary

Webタイムカードを物理で押すボタンです。


## Architecture

![architecture](https://user-images.githubusercontent.com/20965271/124957335-ee4f1680-e053-11eb-9e63-a63ceb368317.png)


## Dependency

- Amazon Web Services
- Docker
- Node.js 14
- [Serverless Framework](https://www.serverless.com/)
- [Swagger](https://swagger.io/)
- [Viron](https://github.com/cam-inc/viron)
- [Playwright](https://github.com/microsoft/playwright)
- M5StickC


## Setup

本リポジトリーから Clone してから実際に動かすまでの手順を示します。

### ローカル環境

```bash
$ docker-compose up
```

### AWSへデプロイ

#### 事前準備

- `/src/env.prod.yml` ファイルを予め作成しておく必要があります
- Cognito ユーザープール (カスタム属性 `custom:apikey` を持つ) およびアプリクライアント、Hosted UI を作成しておく必要があります
- S3バケット (`SERVICENAME-prod`) を予め作成しておく必要があります

#### コマンド

```bash
$ yarn release:prod
```

### AWSから撤収

#### コマンド

```bash
$ yarn destroy:prod
```

### CI/CD に必要な設定

以下のシークレットをリポジトリーに設定することで、masterブランチへ Push するたびに自動デプロイされるようになります。

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `ENV_ADMINISTRATOR_IAM_USER`
- `ENV_COGNITO_BASE_URL`
- `ENV_COGNITO_CLIENT_ID`
- `ENV_COGNITO_CLIENT_SECRET`
- `ENV_COGNITO_USERPOOL_ID`
- `ENV_KINTAI_WEBSITE_URL`


## Usage

### 利用開始

1. 管理者がSSMオートメーション [CreateUserSSMAutomation] にて登録メールアドレスを入力して実行します。
2. ユーザーに管理画面URL、APIサーバーURL、仮パスワードが記載されたメールが届きます。
3. 管理画面URLにアクセスし、APIサーバーURLでエンドポイントを追加します。
4. エンドポイントにアクセスし、Cognito経由でログインします。
5. 勤怠システム接続設定画面から勤怠ユーザー名、パスワードを登録します。
6. 勤怠システム接続設定画面からタイムカード打刻テストを行います。

### 物理ボタン

1. Arduino IDE等でAPIキー (SSMオートメーションの出力に含まれる) を埋め込んでビルドします。
2. 任意のタイミングでボタンを押します。

### 利用停止

1. 管理画面URLにアクセスし、APIサーバーURLでエンドポイントを追加します。
2. エンドポイントにアクセスし、Cognito経由でログインします。
3. 勤怠システム接続設定画面からタイムカードボタン利用停止を実行します。


## License

[MIT](LICENSE.md)


## Author

[tissueMO](https://github.com/tissueMO)
