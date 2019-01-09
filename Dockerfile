# Builds production image for rumors-api.
# Environments not included, should be composed in https://github.com/cofacts/rumors-deploy.
#
FROM node:carbon@sha256:5aebe186c00da3308c8fde5b3a246d1927a56947a1b51f5c4308b7318adf74f4
WORKDIR /srv/www

# make node_modules cached.
# Src: https://nodesource.com/blog/8-protips-to-start-killing-it-when-dockerizing-node-js/
#
COPY package.json package-lock.json ./

# When running with --production --pure-lockfile,
# There will always be some missing modules. Dunno why...
#
RUN npm install --production

# Other files, so that other files do not interfere with node_modules cache
#
COPY . .

EXPOSE 5000

ENTRYPOINT NODE_ENV=production ELASTIC_LOG_LEVEL=info npm start
