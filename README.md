# rumors-api

[![Build Status](https://travis-ci.org/MrOrz/rumors-api.svg?branch=master)](https://travis-ci.org/MrOrz/rumors-api) [![Coverage Status](https://coveralls.io/repos/github/MrOrz/rumors-api/badge.svg?branch=master)](https://coveralls.io/github/MrOrz/rumors-api?branch=master)

GraphQL API server for clients like rumors-site and rumors-line-bot


## Development

We use `docker-compose` to build up dev environment. The docker images contains
elasticsearch, kibana and NodeJS (Yes, you don't even need to install node on your machine!).
If you have got [docker-compose working](https://docs.docker.com/compose/install/) working, just:

```
$ USER_ID=$UID docker-compose up
```

This will:

* Runs `yarn` and installs stuff to `node_modules` using your user ID.
* rumors-api server on `http://localhost:5000`. It will be re-started when you update anyfile.
* Kibana on `http://localhost:6222`.
* ElasticSearch DB on `http://localhost:62222`.

If you omit `USER_ID=$UID` you will see `WARNING: The USER_ID variable is not set. Defaulting to a blank string.` and stuff in `node_modules` will be installed using root access, which is probably not what you want.

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
$ USER_ID=$UID docker-compose up -d
```

Access the logs using:

```
$ docker-compose logs api     # `api' can also be `db', `kibana' or `yarn-install'.
$ docker-compose logs -f api  # Tail mode
```

### But I have `docker`, `npm` & `yarn` installed, why typing so many characters?

Sure you need not.

If you have `npm` and `yarn` installed, you can just invoke `yarn install` to add packages, `npm run XXX` to run scripts (as long as it does not uses a port in use). Actually we suggest developers to install `npm` and `yarn` installed and do all the work. Only use `docker-compose` to spin up the services the API server depends on.


### About `test/rumors-db`

This directory is managed by git-subtree. Please don't modify anything inside `test/rumors-db`; send pull requests to https://github.com/MrOrz/rumors-db instead.

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

# If you don't have npm, run:
$ docker run --rm -it -v `pwd`:/srv -w /srv --network=rumorsapi_default -e 'NODE_CONFIG={"ELASTICSEARCH_URL":"http://db:9200"}' kkarczmarczyk/node-yarn:6.9 npm run evaluate
```

### 知之為知之：False-negative test (previously: same-doc validation)

Tests if the DB can find the correct document when we query against any existing document in DB.


### 不知為不知：False-positive test

From all documents that is not in DB but reported by the user in ["Is This Useful"](https://airtable.com/shr23o1yosGdfd3Xy) reports, tests if `Search` erroneously match an article in DB.

The "Rumor samples not in DB" is in `test/evalutation/non-db-samples-xxx.csv`.


## Test

To prepare test DB, first start an elastic search server on port 62223:

```
$ docker run -d -p "62223:9200" --name "rumors-test-db" elasticsearch
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
$ npm run test:jest -- -u
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
