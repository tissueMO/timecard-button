FROM node:14

ARG TINI_VERSION=v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini
ENTRYPOINT ["/tini", "--"]

# DynamoDB Local で必要
RUN apt update -y \
 && apt install -y openjdk-8-jre

USER 1000
WORKDIR /app

EXPOSE 3000
EXPOSE 8000

CMD ["yarn", "dev"]
