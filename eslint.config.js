// ESLint: `npm run lint` (also the `lint` step of `npm run check`).
// Lean on purpose: JavaScript and TypeScript basics, plus the rules browser
// stores enforce on extensions: no eval, no new Function, no string timers
// (Manifest V3 forbids running code that isn't in the package).
// TypeScript (`npm run typecheck`) does the type checking.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', '.data/', 'node_modules/', 'shots/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node, chrome: 'readonly' } },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      // Undefined names are TypeScript's job (typescript-eslint's advice).
      'no-undef': 'off',
      // `_name` marks an argument or variable that's unused on purpose.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // Extension code runs in the browser: no Node APIs there.
    files: ['src/**/*.ts'],
    ignores: ['src/manifest.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['node:*'], message: 'Extension code runs in the browser; Node modules are only for scripts/ and tests/.' }] }],
    },
  },
);
