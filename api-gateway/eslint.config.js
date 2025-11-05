// ESLint v9 flat config for API Gateway
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
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-undef': 'off',
    },
  },
  // Domain layer (if present): enforce framework-agnostic imports
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
              group: ['@nestjs/*', '@fastify/*'],
              message: 'Do not import framework adapters in domain',
            },
          ],
        },
      ],
    },
  },
];


