import globals from 'globals';

/**
 * ESLint: только правила, ловящие реальные дефекты (не стиль).
 * Запуск: npm run lint
 */
export default [
    {
        ignores: ['vendor/**', 'node_modules/**', 'css/**', 'downloads/**', 'files/**'],
    },
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.serviceworker,
                XLSX: 'readonly',
                PDFLib: 'readonly',
                fontkit: 'readonly',
                Sortable: 'readonly',
                tailwind: 'readonly',
            },
        },
        linterOptions: { reportUnusedDisableDirectives: 'off' },
        rules: {
            'no-undef': 'error',
            'no-dupe-keys': 'error',
            'no-dupe-args': 'error',
            'no-dupe-else-if': 'error',
            'no-duplicate-case': 'error',
            'no-unreachable': 'error',
            'no-unsafe-negation': 'error',
            'no-unsafe-finally': 'error',
            'no-unsafe-optional-chaining': 'error',
            'no-self-assign': 'error',
            'no-self-compare': 'error',
            'no-cond-assign': ['error', 'except-parens'],
            'no-constant-binary-expression': 'error',
            'no-loss-of-precision': 'error',
            'no-async-promise-executor': 'error',
            'no-compare-neg-zero': 'error',
            'no-func-assign': 'error',
            'no-import-assign': 'error',
            'no-const-assign': 'error',
            'no-redeclare': 'error',
            'no-sparse-arrays': 'error',
            'no-template-curly-in-string': 'warn',
            'use-isnan': 'error',
            'valid-typeof': 'error',
            'getter-return': 'error',
            'no-unused-vars': [
                'warn',
                { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' },
            ],
        },
    },
    {
        files: ['**/*.test.js', 'vitest.config.js', 'eslint.config.js', 'scripts/**/*.mjs', 'e2e/**/*.mjs'],
        languageOptions: { globals: { ...globals.node, ...globals.vitest } },
    },
];
