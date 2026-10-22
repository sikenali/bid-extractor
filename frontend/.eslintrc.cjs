/* ESLint 配置：只做静态检查，格式化交给编辑器/不入库。
   Vue 3 + TypeScript，规则集取最低风险的 essential + recommended。 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: 'vue-eslint-parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: '@typescript-eslint/parser',
    extraFileExtensions: ['.vue'],
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-essential',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // 代码库大量使用 any 描述后端返回结构，暂不作为问题上报
    '@typescript-eslint/no-explicit-any': 'off',
    // 组件多为页面级容器/组件名与目录名一致，不强制多词命名
    'vue/multi-word-component-names': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // 后端不可达时的静默降级是既定策略
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-undef': 'off',
  },
  ignorePatterns: ['dist/', 'node_modules/', 'release/', 'src/**/*.d.ts', 'assets/'],
};
