module.exports = {
  apps: [
    {
      name: 'rumors-api',
      script: 'build/index.js',
      env_production: {
        NODE_ENV: 'production',
      },
      instances: process.env.WEB_CONCURRENCY ? +process.env.WEB_CONCURRENCY : 1,
      exec_mode: 'cluster',
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      out_file: '/dev/null',
      error_file: '/dev/null',
    },
  ],
};
