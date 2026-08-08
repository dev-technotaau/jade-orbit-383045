import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import pluginPromise from 'eslint-plugin-promise';
import pluginN from 'eslint-plugin-n';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    pluginPromise.configs['flat/recommended'],
    pluginN.configs['flat/recommended'],
    prettierConfig,
    {
        ignores: [
            'dist/**',
            'dist-check/**',
            'node_modules/**',
            'coverage/**',
            'logs/**',
            '*.js',
            '*.mjs',
            'prisma/seeds/**',
            'test/**',
        ],
    },
    {
        languageOptions: {
            parserOptions: {
                project: './tsconfig.json',
            },
        },
        rules: {
            // TypeScript
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/no-misused-promises': 'off',

            // Security
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',

            // Best practices
            'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
            'no-return-await': 'warn',
            'prefer-const': 'error',
            'no-var': 'error',
            // Allow `== null` / `!= null` — idiomatic null-or-undefined check.
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            curly: ['warn', 'multi-line'],

            // Node
            'n/no-process-exit': 'off',
            'n/no-missing-import': 'off',
            'n/no-missing-require': 'off',
            'n/no-unsupported-features/es-syntax': 'off',
            'n/no-unpublished-import': 'off',
        },
    }
);
