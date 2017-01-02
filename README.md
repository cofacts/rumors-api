# rumors-api
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

### Seeding the data

Please clone [rumors-db](https://github.com/MrOrz/rumors-db) and follow the instructions in it.

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

## Deploy

Build docker image

```
$ npm run build
```

Run the docker image on local machine, then visit `http://localhost:5000`.
(You should make sure elastic search server is running at port 9200)

```
$ docker run --rm -p 5000:5000 mrorz/rumors-api
```

Push to dockerhub
```
$ docker push mrorz/rumors-api
```
