# syntax=docker/dockerfile:1

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilt binaries in its package, but newer npm still
# tries node-gyp on it (no Python here). No runtime dependency needs a script.
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production \
    DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
# The SQLite database and the clip cache live here; mount a volume over it.
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
CMD ["node", "dist/index.js"]
