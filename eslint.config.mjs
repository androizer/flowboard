import js from '@eslint/js';
import nx from '@nx/eslint-plugin';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-prisma/**',
      '**/node_modules/**',
      '**/.nx/**',
      'apps/api/prisma/migrations/**',
    ],
  },
  ...nx.configs['flat/base'],
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allow: [],
          depConstraints: [
            {
              onlyDependOnLibsWithTags: ['scope:contracts'],
              sourceTag: 'scope:web',
            },
            {
              onlyDependOnLibsWithTags: ['scope:contracts'],
              sourceTag: 'scope:api',
            },
            {
              onlyDependOnLibsWithTags: ['*'],
              sourceTag: 'scope:contracts',
            },
          ],
          enforceBuildableLibDependency: true,
        },
      ],
    },
  },
  prettier,
);
