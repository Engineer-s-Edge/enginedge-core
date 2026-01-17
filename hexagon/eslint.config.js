// ESLint v9 flat config for TypeScript + Jest test files
// This keeps rules lightweight to avoid blocking tests and enables auto-fixes.

import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    files: ['**/*.ts'],
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: false,
      },
      globals: {
        // CommonJS/Node
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Keep defaults lenient for test-heavy codebase
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-undef': 'off',
    },
  },
  // Domain layer: enforce framework-agnostic imports
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@nestjs/common', message: 'Do not import NestJS in domain' },
            { name: '@nestjs/core', message: 'Do not import NestJS in domain' },
            { name: '@nestjs/platform-express', message: 'Do not import NestJS platform in domain' },
            { name: '@nestjs/platform-fastify', message: 'Do not import NestJS platform in domain' },
            { name: '@nestjs/swagger', message: 'Do not import Swagger in domain' },
            { name: 'rxjs', message: 'Do not import RxJS in domain' },
            { name: '@fastify/*', message: 'Do not import Fastify in domain' },
            { name: 'prom-client', message: 'Do not import Prometheus in domain' },
          ],
          patterns: [
            {
              group: [
                '@nestjs/*',
                '@fastify/*',
              ],
              message: 'Do not import framework adapters in domain',
            },
          ],
        },
      ],
    },
  },
  // Test files: enable Jest globals without extra plugins
  {
    files: ['src/test/**/*.ts', '**/*.spec.ts', '**/__mocks__/**/*.ts'],
    languageOptions: {
      globals: {
        // Jest globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        jest: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
      },
    },
    rules: {
      // Be even more permissive in tests
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
];
