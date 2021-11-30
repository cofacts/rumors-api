# rumors-api

[![CI test](https://github.com/cofacts/rumors-api/actions/workflows/ci.yml/badge.svg)](https://github.com/cofacts/rumors-api/actions/workflows/ci.yml) [![Coverage Status](https://coveralls.io/repos/github/cofacts/rumors-api/badge.svg?branch=master)](https://coveralls.io/github/cofacts/rumors-api?branch=master)

GraphQL API server for clients like rumors-site and rumors-line-bot

## Configuration

For development, copy `.env.sample` to `.env` and make necessary changes.

For production via [rumors-deploy](http://github.com/cofacts/rumors-deploy), do setups in `docker-compose.yml`.

### App settings

The "client apps" of this API includes:
- [cofacts/rumors-site](https://github.com/cofacts/rumors-site), the Cofacts web app for visitors & editors
- [cofacts/rumors-line-bot](https://github.com/cofacts/rumors-line-bot), the Cofacts LINE chatbot
- [cofacts/rumors-ai-bert](https://github.com/cofacts/rumors-ai-bert), the BERT classifier for article categories
- Other third-party applications

Except rumors-site, API will identify each app using the shared secret sent via the HTTP header set in `HTTP_HEADER_APP_SECRET` (`x-app-secret` by default).

The mapping of app secrets to the `appId`s used in the database is documented in the YAML file in `APP_SETTINGS_PATH`. See `app-settings.sample.yaml` for example.

## Development

### Prerequisite

* Docker & [docker-compose](https://docs.docker.com/compose/install/)

### First-time setup

After cloning this repository & cd into project directory, then install the dependencies.

```
$ git clone --recursive git@github.com:MrOrz/rumors-api.git # --recursive for the submodules
$ cd rumors-api

# This ensures gRPC binary package are installed under correct platform during development
$ docker-compose run --rm --entrypoint="npm i" api
```

If you want to test OAuth2 authentication, you will need to fill in login credentials in `.env`. Please apply for the keys in Facebook, Twitter and Github respectively.

### Start development servers

```
$ mkdir esdata # For elasticsearch DB
$ docker-compose up
```

This will:

* rumors-api server on `http://localhost:5000`. It will be re-started when you update anyfile.
* rumors-site on `http://localhost:3000`. You can populate session cookie by "logging-in" using the site
  (when credentials are in-place in `.env`).
  However, it cannot do server-side rendering properly because rumors-site container cannot access
  localhost URLs.
* Kibana on `http://localhost:6222`.
* ElasticSearch DB on `http://localhost:62222`.
* [URL resolver](https://github.com/cofacts/url-resolver) on `http://localhost:4000`

To stop the servers, just `ctrl-c` and all docker containers will be stopped.

### Populate ElasticSearch with data

Ask a team member to send you `nodes` directory, then run:
```
$ docker-compose stop db
```
to stop db instance.

put the `nodes` directory right inside the `esdata` directory created in the previous step, then restart the database using:

```
$ docker-compose start db
```

### Detached mode & Logs

If you do not want a console occupied by docker-compose, you may use detached mode:

```
$ docker-compose up -d
```

Access the logs using:

```
$ docker-compose logs api     # `api' can also be `db', `kibana'.
$ docker-compose logs -f api  # Tail mode
```

### About `test/rumors-db`

This directory is managed by git submodule. Use the following command to update:

```
$ npm run rumors-db:pull
```

## Lint

```
# Please check lint before you pull request
$ npm run lint
# Automatically fixes format error
$ npm run lint:fix
```

## Test

To prepare test DB, first start an elastic search server on port 62223:

```
$ docker run -d -p "62223:9200" --name "rumors-test-db" docker.elastic.co/elasticsearch/elasticsearch-oss:6.3.2
# If it says 'The name "rumors-test-db" is already in use',
# Just run:
$ docker start rumors-test-db
```

Then run this to start testing:

```
$ npm t
```

If you get "Elasticsearch ERROR : DELETE http://localhost:62223/replies => socket hang up", please check if test database is running. It takes some time for elasticsearch to boot.

If you want to run test on a specific file (ex: `src/xxx/__tests__/ooo.js`), run:

```
$ npm t -- src/xxx/__tests__/ooo.js
```


When you want to update jest snapshot, run:

```
$ npm t -- -u
```

## Deploy

Build docker image. The following are basically the same, but with different docker tags.

```
$ docker build -t cofacts/rumors-api:latest .
```

Run the docker image on local machine, then visit `http://localhost:5000`.
(To test functions involving DB, ElasticSearch DB must work as `.env` specified.)

```
$ docker run --rm -it -p 5000:5000 --env-file .env cofacts/rumors-api
```

## Cronjob scripts

### Clean up old `urls` entries that are not referenced by any article & reply

The `urls` index serves as a cache of URL scrapper and will enlarge as `ListArticle` is invoked with
URLs. The following script cleans up those `urls` that no article & reply currently uses.

```
$ docker-compose exec api node_modules/.bin/babel-node src/scripts/cleanupUrls.js
```

### Fetching user activities from Google Analytics
-  First make sure the following params are set in `.env`:
  `GOOGLE_OAUTH_KEY_PATH`,  `GA_WEB_VIEW_ID`, `GA_LINE_VIEW_ID`

-  To fetch stats for the current date, run:
```
$ node_modules/.bin/babel-node src/scripts/fetchStatsFromGA.js
```

-  For more options, run the above script with `--help` or see the file level comments.

### Removing article-reply from database
-  To set an article-reply to deleted state on production, run:
```
$ node build/scripts/removeArticleReply.js --userId=<userId> --articleId=<articleId> --replyId=<replyId>
```

-  For more options, run the above script with `--help` or see the file level comments.

### Block a user
- Please announce that the user will be blocked openly with a URL first.
- To block a user, execute the following:
```
$ node build/scripts/blockUser.js --userId=<userId> --blockedReason=<Announcement URL>
```

-  For more options, run the above script with `--help` or see the file level comments.


## One-off migration scripts

### Fill in `urls` index and `hyperlinks` field for all articles & replies

First, make sure `.env` is configured so that the correct DB is specified.
Then at project root, run:
```
$ node_modules/.bin/babel-node src/scripts/migrations/fillAllHyperlinks.js
```

This script would scan for all articles & replies to fill in their `hyperlinks` field, also populates
`urls` index. The `urls` index is used as cache. If an URL already exists in `urls`, it will not trigger
HTTP request.


### Generate User instances for backend users

First, make sure `.env` is configured so that the correct DB is specified, you might want to create a snapshot before running the script.
Then at project root, run:
```
$ node_modules/.bin/babel-node src/scripts/migrations/createBackendUsers.js
```

This script would scan for all the user references in `analytics`, `articlecategoryfeedbacks`, `articlereplyfeedbacks`,
`articles`, `replies`, `replyrequests`, create users for those that are not already in db and updates all the docs.
See the comments at the top of the script for how users are referenced in each doc.


## Troubleshooting

### Failed to load gRPC binary on Mac

If `rumors-api` server fails to start due to the following error:
```
Cannot find module '/srv/www/node_modules/grpc/src/node/extension_binary/node-v72-linux-x64-glibc/grpc_node.node'
```
try running:
```
npm rebuild --target_platform=linux --target_arch=x64 --target_libc=glibc --update-binary
```

## Legal

`LICENSE` defines the license agreement for the source code in this repository.

`LEGAL.md` is the user agreement for Cofacts data users that leverages Cofacts data provided by API or via cofacts/opendata.
