module.exports = {
  parser: 'babel-eslint',
  extends: [
    'eslint:recommended',
    'plugin:import/errors',
    'plugin:import/warnings',
    'prettier',
  ],
  env: {node: true, es6: true, jest: true},
  plugins: [
    'prettier',
  ],
  rules: {
    'prettier/prettier': ['error', {
      trailingComma: 'es5',
      'singleQuote': true,
    }],
  },
  settings: {
    'import/resolver': {
      'babel-module': {}
    }
  }
}
