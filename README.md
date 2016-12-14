# rumors-api
GraphQL API server for clients like rumors-site and rumors-line-bot

## Development

Requires elasticsearch be already up and running.

```
$ yarn
$ npm run dev
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
