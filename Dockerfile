FROM node:18.15.0

RUN node -v

RUN mkdir -p /usr/src/bot
WORKDIR /usr/src/bot

RUN npm install -g ts-node

COPY package.json /usr/src/bot
RUN npm install

COPY . /usr/src/bot

ENV NODE_ENV=production

RUN apt -y update && apt -y upgrade
RUN apt-get -y install build-essential
RUN apt -y install ffmpeg

CMD ["ts-node", "./src/index.ts"]