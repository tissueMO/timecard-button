ARG FUNCTION_DIR="/function"

# ビルドステージ
FROM mcr.microsoft.com/playwright:focal AS build

ARG FUNCTION_DIR
WORKDIR ${FUNCTION_DIR}

RUN apt-get update -y \
 # Lambda RIC のインストールに必要
 && apt-get install -y g++ make cmake unzip libcurl4-openssl-dev autoconf libtool \
 # ブラウザー日本語対応
 && apt-get -y install locales language-pack-ja fonts-ipafont-gothic fonts-ipafont-mincho \
 && echo "ja_JP UTF-8" > /etc/locale.gen && locale-gen

COPY package.json ${FUNCTION_DIR}
RUN npm install \
 # Lambda RIC をインストール
 && npm install aws-lambda-ric

# ソースコードを配置
COPY functions/ ${FUNCTION_DIR}


# 本番ステージ
FROM mcr.microsoft.com/playwright:focal AS prod

ARG FUNCTION_DIR
WORKDIR ${FUNCTION_DIR}

# 必要なファイル一式をビルドステージからコピー
COPY --from=build ${FUNCTION_DIR} ${FUNCTION_DIR}

# ローカル実行向けに Lambda RIE をインストール
ADD https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/latest/download/aws-lambda-rie /usr/local/bin/aws-lambda-rie
RUN chmod 755 /usr/local/bin/aws-lambda-rie
COPY entrypoint.sh /
RUN chmod 755 /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

# Lambda ハンドラー
CMD ["handler.executeTimecard"]
