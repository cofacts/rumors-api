# rumors-api

[![Build Status](https://travis-ci.org/cofacts/rumors-api.svg?branch=master)](https://travis-ci.org/cofacts/rumors-api) [![Coverage Status](https://coveralls.io/repos/github/cofacts/rumors-api/badge.svg?branch=master)](https://coveralls.io/github/cofacts/rumors-api?branch=master)

GraphQL API server for clients like rumors-site and rumors-line-bot


## Development

### Prerequisite

* node 6+ with [yarn](https://yarnpkg.com/en/) available as global command
* Docker & [docker-compose](https://docs.docker.com/compose/install/)

### First-time setup

After cloning this repository & cd into project directory, then install the dependencies.

```
$ git clone --recursive git@github.com:MrOrz/rumors-api.git # --recursive for the submodules
$ cd rumors-api
$ yarn
```

If you want to test OAuth2 authentication, you will need to create `config/local-development.js` (already in `.gitignore`) with the following content:

```
module.exports = {
  FACEBOOK_APP_ID: '⋯⋯',
  FACEBOOK_SECRET: '⋯⋯',
  TWITTER_CONSUMER_KEY: '⋯⋯',
  TWITTER_CONSUMER_SECRET: '⋯⋯',
  GITHUB_CLIENT_ID: '⋯⋯',
  GITHUB_SECRET: '⋯⋯',
};
```

Please apply for the keys in Facebook, Twitter and Github respectively.

### Start development servers

```
$ docker-compose up
```

This will:

* Runs `yarn` and installs stuff to `node_modules` using your user ID.
* rumors-api server on `http://localhost:5000`. It will be re-started when you update anyfile.
* Kibana on `http://localhost:6222`.
* ElasticSearch DB on `http://localhost:62222`.

To stop the servers, just `ctrl-c` and all docker containers will be stopped.

### Populate ElasticSearch with seed data

First, make sure the elastic search is working (should be handled by the previous step),
Then just run:

```
$ npm run seed
```

### Detached mode & Logs

If you do not want a console occupied by docker-compose, you may use detached mode:

```
$ docker-compose up -d
```

Access the logs using:

```
$ docker-compose logs api     # `api' can also be `db', `kibana' or `yarn-install'.
$ docker-compose logs -f api  # Tail mode
```

### About `test/rumors-db`

This directory is managed by git submodule. Use the following command to update:

```
$ npm run rumors-db:pull
```

## Evaluate search performance

> 知之為知之，不知為不知，是知也。

|                            | Found          | Not Found      |
|----------------------------|----------------|----------------|
| DB has such rumor          | True positive  | False negative |
| DB doesn't have such rumor | False positive | True negative  |

We use a static set of articles to test false positives and false negatives inside test DB.

To prepare test DB, first start an elastic search server on port 62223:

```
$ docker run -d -p "62223:9200" --name "rumors-test-db" elasticsearch
# If it says 'The name "rumors-test-db" is already in use',
# Just run:
$ docker start rumors-test-db
```

Then run:

```
$ npm run evaluate
```

### 知之為知之：False-negative test (previously: same-doc validation)

Tests if the DB can find the correct document when we query against any existing document in DB.


### 不知為不知：False-positive test

From all documents that is not in DB but reported by the user in ["Is This Useful"](https://airtable.com/shr23o1yosGdfd3Xy) reports, tests if `Search` erroneously match an article in DB.

The "Rumor samples not in DB" is in `test/evalutation/non-db-samples-xxx.csv`.


## Lint

```
$ npm run lint # Automatically fixes format error
```

## Test

To prepare test DB, first start an elastic search server on port 62223:

```
$ docker run -d -p "62223:9200" --name "rumors-test-db" docker.elastic.co/elasticsearch/elasticsearch:6.1.0
# If it says 'The name "rumors-test-db" is already in use',
# Just run:
$ docker start rumors-test-db
```

Then run this to start testing:

```
$ npm t
```

If you get "Elasticsearch ERROR : DELETE http://localhost:62223/replies => socket hang up", please check if test database is running. It takes some time for elasticsearch to boot.

When you want to update jest snapshot, run:

```
$ npm run test:update
```

## Deploy

Build docker image

```
$ npm run build
```

Run the docker image on local machine, then visit `http://localhost:5000`.
(To test functions involving DB, ElasticSearch DB must work as `config/default.js` specified.)

```
$ docker run --rm -it -p 5000:5000 mrorz/rumors-api
```

Push to dockerhub
```
$ docker push mrorz/rumors-api
```
