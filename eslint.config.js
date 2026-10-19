// Flat ESLint config (eslint v9). Complements `tsc --noEmit`: it catches
// unused variables, debug leftovers, and risky JS patterns that typechecking
// does not flag. Rules are intentionally conservative — warnings for style-ish
// findings, errors for real bugs — so the lint gate can run in CI without a
// large cleanup debt.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'api/handler.js', // generated bundle (esbuild output)
      '.omnirush/**',
      'leish-studio-google/**',
      'test-setup.cjs',
      'check-env.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,cjs,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Real-bug guards
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      eqeqeq: ['error', 'smart'],
      'require-await': 'off',
      // TS-specific tuning to avoid noise in existing code
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // Server + scripts run under Node only; silence browser-global ambiguity
    files: ['server/**/*.ts', 'scripts/**/*.ts', '*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Test files may use console and non-null assertions freely
    files: ['**/*.test.ts', 'vitest.setup.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // React hooks linting for the frontend.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Generic disable-directives like `// eslint-disable-next-line react-hooks/...`
    // cannot be resolved to a concrete rule id; treat them as intentional.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
);
