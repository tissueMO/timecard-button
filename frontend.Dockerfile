FROM node:9 AS build

ARG VIRON_VERSION=v1.3.0
RUN git clone https://github.com/cam-inc/viron.git -b $VIRON_VERSION app \
 && cd /app \
 && npm install

COPY viron/css/components/Application_Menu.css /app/src/css/components/
COPY viron/css/components/Application_Poster.css /app/src/css/components/
COPY viron/store/actions/auth.js /app/src/store/actions/

WORKDIR /app
EXPOSE 443

CMD ["npm", "start"]
