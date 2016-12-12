module.exports = {
  extends: 'airbnb',
  env: {node: true, browser: false},
  rules: {
    'no-underscore-dangle': ['error', {allowAfterThis: true}],
    'no-param-reassign': 'off', // ctx.body = xxx is how koa2 works.
  },
  settings: {
    'import/resolver': {
      'babel-module': {}
    }
  }
}
