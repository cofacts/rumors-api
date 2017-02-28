module.exports = {
  ELASTICSEARCH_URL: 'http://localhost:62222', // Shared by api-server and CLI evaluation script
  ELASTIC_LOG_LEVEL: 'warning',
  PORT: 5000,
  ROLLBAR_TOKEN: 'YOUR_ROLLBAR_TOKEN',
  ROLLBAR_ENV: 'localhost',
  RUMORS_SITE_CORS_ORIGIN: 'http://localhost:3000',
  COOKIE_MAXAGE: 86400 * 1000 * 14,
  COOKIE_SECRETS: ['foo', 'bar'],
  FACEBOOK_APP_ID: 'YOUR_FB_ID',
  FACEBOOK_SECRET: 'YOUR_FB_SECRET',
  FACEBOOK_CALLBACK_URL: 'http://localhost:5000/callback/facebook',
};
