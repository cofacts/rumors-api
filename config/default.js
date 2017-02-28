module.exports = {
  ELASTICSEARCH_URL: 'http://localhost:62222', // Shared by api-server and CLI evaluation script
  ELASTIC_LOG_LEVEL: 'warning',
  PORT: 5000,
  ROLLBAR_TOKEN: 'YOUR_ROLLBAR_TOKEN',
  ROLLBAR_ENV: 'localhost',

  HTTP_HEADER_APP_ID: 'x-app-id',
  HTTP_HEADER_APP_SECRET: 'x-app-secret',
  RUMORS_SITE_CORS_ORIGIN: 'http://localhost:3000', // official web clients
  RUMORS_LINE_BOT_SECRET: 'secret', // official line bot client

  COOKIE_MAXAGE: 86400 * 1000 * 14,
  COOKIE_SECRETS: ['foo', 'bar'],
  FACEBOOK_APP_ID: 'YOUR_FB_ID',
  FACEBOOK_SECRET: 'YOUR_FB_SECRET',
  FACEBOOK_CALLBACK_URL: 'http://localhost:5000/callback/facebook',
  TWITTER_CONSUMER_KEY: 'YOUR_TWITTER_CONSUMER_KEY',
  TWITTER_CONSUMER_SECRET: 'YOUR_TWITTER_CONSUMER_SECRET',
  TWITTER_CALLBACK_URL: 'http://localhost:5000/callback/twitter',
  GITHUB_CLIENT_ID: 'YOUR_GITHUB_CLIENT_ID',
  GITHUB_SECRET: 'YOUR_GITHUB_CLIENT_SECRET',
  GITHUB_CALLBACK_URL: 'http://localhost:5000/callback/github',
};
