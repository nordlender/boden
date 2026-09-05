// @ts-check
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintPluginAstro from 'eslint-plugin-astro';
import globals from 'globals';

// Flat ESLint config. Deliberately lenient: the goal is a green baseline on
// the existing codebase, not maximum strictness — noisy pre-existing style
// issues are dialed down to warnings rather than hand-fixed file by file.
// See eslint-plugin-astro's docs for the tseslint-before-astro ordering
// (astro's config re-asserts the right parser for .astro files afterwards).
export default defineConfig(
  globalIgnores(['dist/**', '.astro/**', 'data/**', 'node_modules/**']),
  tseslint.configs.recommended,
  eslintPluginAstro.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'warn',
      'no-empty': 'warn',
      'no-case-declarations': 'warn',
    },
  },
  {
    files: ['**/*.astro'],
    rules: {
      // Astro frontmatter commonly destructures props/data it doesn't use
      // yet during active development — keep this a warning for .astro.
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
);
