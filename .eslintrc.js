module.exports = {
  root: true,
  env: {
    node: true
  },
  'extends': [
    'plugin:vue/essential',
    'eslint:recommended'
  ],
  parserOptions: {
    parser: 'babel-eslint'
  },
  rules: {
    'no-console': 'off',
    'no-debugger': 'off',
    'no-useless-escape': 'off',
    'no-mixed-spaces-and-tabs': 'off',
    'no-prototype-builtins': 'off',
    'vue/multi-word-component-names': 'off',
    'vue/no-mutating-props': 'off'
  },
  overrides: [
    {
      files: [
        '**/__tests__/*.{j,t}s?(x)',
        '**/tests/unit/**/*.{j,t}s?(x)'
      ],
      env: {
        jest: true
      },
      rules: {
        /**
         * Test doubles implement the real signature and ignore the arguments.
         * mocks/MockModelService.js is 68 of these, and the parameter list is
         * the only documentation of the contract the mock stands in for, so
         * stripping the arguments would leave the stubs self contradicting.
         *
         * Only args are relaxed. Unused imports and variables are still
         * errors here, and src/ keeps the default after-used, so an unused
         * parameter in production code is still reported.
         */
        'no-unused-vars': ['error', { args: 'none' }]
      }
    }
  ]
}
