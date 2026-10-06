import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['web/vendor/**', 'tests/qa3d-runtime.mjs', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['web/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tools/**/*.mjs', '*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
