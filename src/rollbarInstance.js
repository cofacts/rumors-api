import Rollbar from 'rollbar';
import config from 'config';

const rollbar = new Rollbar({
  accessToken: config.get('ROLLBAR_TOKEN'),
  captureUncaught: true,
  captureUnhandledRejections: true,
  environment: config.get('ROLLBAR_ENV'),
});

export default rollbar;
