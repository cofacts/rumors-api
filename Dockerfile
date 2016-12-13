FROM kkarczmarczyk/node-yarn:6.9
WORKDIR /srv/www

# make node_modules cached.
# Src: https://nodesource.com/blog/8-protips-to-start-killing-it-when-dockerizing-node-js/
#
COPY package.json yarn.lock ./
RUN yarn --production --pure-lockfile

# Other files, so that other files do not interfere with node_modules cache
#
COPY . .

ENTRYPOINT NODE_ENV=production npm start
