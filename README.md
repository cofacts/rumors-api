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

Run the docker image on local machine

```
$ docker run --rm -d -e "PORT=xxxx" rumors-api
```
