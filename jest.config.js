module.exports = {
  //preset: '@vue/cli-plugin-unit-jest',
  moduleNameMapper: {
    '^uuid$': require.resolve('uuid'),
  },
  /**
   * Every alias in vue.config.js points somewhere inside src/, so adding src to
   * the module search path makes `core/...`, `services/...`, `util/...` and
   * friends resolve here the same way they do in a webpack build, without
   * having to enumerate them twice.
   */
  modulePaths: ['<rootDir>/src'],
}
