import Rollbar from 'rollbar';

const rollbar = new Rollbar({
  verbose: true,
  accessToken: process.env.ROLLBAR_TOKEN,
  captureUncaught: true,
  captureUnhandledRejections: true,
  environment: process.env.ROLLBAR_ENV,
});

export default rollbar;
