export default {
    languageOptions: {
        ecmaVersion: 'latest'
    },
    env: {
        es6: true,
        node: true
    },
    extends: 'eslint:recommended',
    rules: {
        'indent': [
            'error',
            4,
            { 'SwitchCase': 1 }
        ],
        'linebreak-style': [
            'error',
            'unix'
        ],
        'quotes': [
            'error',
            'single',
            { 'allowTemplateLiterals': true }
        ],
        'semi': [
            'error',
            'always'
        ],
        'no-console': [
            'warn'
        ],
        'no-undef': [
            'off'
        ],
        'no-unused-vars': [
            1
        ],
        'no-useless-escape': [
            'off'
        ],
        'space-before-function-paren': [
            'error',
            'always'
        ],
        'keyword-spacing': [
            'error',
            { 'before': true, 'after': true }
        ],
        'space-before-blocks': [
            'error',
            'always'
        ]
    }
};
