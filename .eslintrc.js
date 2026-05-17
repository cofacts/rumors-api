module.exports = {
  parser: '@babel/eslint-parser',
  extends: [
    'eslint:recommended',
    'plugin:import/errors',
    'plugin:import/warnings',
    'prettier',
  ],
  env: { node: true, es6: true, jest: true },
  plugins: ['prettier', 'import'],
  rules: {
    'prettier/prettier': [
      'error',
      {
        trailingComma: 'es5',
        singleQuote: true,
      },
    ],
    // @modelcontextprotocol/sdk v1 exports McpServer and StreamableHTTPServerTransport via deep
    // paths only (e.g. /server/mcp.js). The eslint-plugin-import resolver does not support the
    // "./*" wildcard in package.json exports, so it falsely flags these as unresolved.
    // See: https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.29.0/docs/server.md
    'import/no-unresolved': ['error', { ignore: ['^@modelcontextprotocol/sdk/'] }],
  },
  settings: {
    'import/resolver': {
      'babel-module': {},
      typescript: {},
    },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts'],
    },
  },
  overrides: [
    {
      files: ['**/*.ts'],
      extends: ['plugin:@typescript-eslint/recommended'],
      plugins: ['@typescript-eslint'],
    },
  ],
};
