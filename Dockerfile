# Builds production image for rumors-api.
#
FROM node:12-alpine AS builder
WORKDIR /srv/www

# make node_modules cached.
# Src: https://nodesource.com/blog/8-protips-to-start-killing-it-when-dockerizing-node-js/
#
COPY package.json package-lock.json ./
RUN npm install

# Other files, so that other files do not interfere with node_modules cache
#
COPY . .

RUN node_modules/.bin/babel src -d build
RUN npm prune --production

#########################################
FROM node:12-alpine

WORKDIR /srv/www
EXPOSE 5000
ENTRYPOINT NODE_ENV=production npm start

COPY --from=builder /srv/www/node_modules ./node_modules
COPY --from=builder /srv/www/build ./build
COPY src/jade ./build/jade
COPY src/util/protobuf ./build/util/protobuf
COPY package.json package-lock.json ecosystem.config.js ./
