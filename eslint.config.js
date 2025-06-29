const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const security = require('eslint-plugin-security');

module.exports = [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
        ecmaFeatures: {
          impliedStrict: true
        }
      },
      globals: {
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        NodeJS: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'security': security
    },
    rules: {
      'quotes': ['warn', 'single'],
      'indent': ['warn', 2, { 'SwitchCase': 1 }],
      'semi': ['error'],
      'comma-dangle': ['warn', 'always-multiline'],
      'dot-notation': 'off',
      'eqeqeq': 'warn',
      'curly': ['warn', 'all'],
      'brace-style': ['warn'],
      'prefer-arrow-callback': ['warn'],
      'max-len': ['warn', 140],
      'no-console': ['warn'],
      'comma-spacing': ['error'],
      'no-multi-spaces': ['warn', { 'ignoreEOLComments': true }],
      'no-trailing-spaces': ['warn'],
      'lines-between-class-members': ['warn', 'always', {'exceptAfterSingleLine': true}],
      'complexity': ['error', { 'max': 15 }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_',
        'args': 'after-used'
      }],
      'no-unused-vars': 'off',  // Turn off base rule to avoid conflicts
      // Security rules (relaxed for legitimate IoT protocol access)
      'security/detect-object-injection': 'off', // Disabled for HomeKit/IntelliCenter protocol communication
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'warn',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-unsafe-regex': 'error'
    }
  },
  {
    ignores: ['dist/**/*']
  }
];