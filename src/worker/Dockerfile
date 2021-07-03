FROM mcr.microsoft.com/playwright:focal as dev

ARG FUNCTION_DIR="/function"
WORKDIR ${FUNCTION_DIR}

RUN apt-get update && apt-get install -y \
  g++ make cmake unzip libcurl4-openssl-dev autoconf libtool

# ブラウザー日本語対応
RUN apt-get update && \
  apt-get -y install locales language-pack-ja fonts-ipafont-gothic fonts-ipafont-mincho && \
  echo "ja_JP UTF-8" > /etc/locale.gen && locale-gen

COPY package.json ${FUNCTION_DIR}
RUN npm install

# Install AWS Lambda Node.js Runtime Interface Client API
RUN npm install aws-lambda-ric

# Copy the rest of the function directory
COPY function/ ${FUNCTION_DIR}

# Multi-stage build: Get a fresh slim copy of base image to reduce final size
FROM mcr.microsoft.com/playwright:focal

# Include global arg in this stage of the build
ARG FUNCTION_DIR

# Set working directory to function root directory
WORKDIR ${FUNCTION_DIR}

# Copy in the built dependencies
COPY --from=build-image ${FUNCTION_DIR} ${FUNCTION_DIR}

# Add Lambda Runtime Interface Emulator and use a script in the ENTRYPOINT for simpler local runs
ADD https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/latest/download/aws-lambda-rie /usr/local/bin/aws-lambda-rie
RUN chmod 755 /usr/local/bin/aws-lambda-rie
COPY entrypoint.sh /
RUN chmod 755 /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]

# Set function handler
CMD ["index.handler"]
