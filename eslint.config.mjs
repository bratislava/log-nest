import { createNestConfig } from '@bratislava/eslint-config-nest'

export default [
  ...createNestConfig({
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    files: ['**/*.spec.ts', '**/*_test_.ts'],
  },
  {
    rules: {
      // Every module here is a dynamic module: providers are returned from
      // `forRoot()`, not listed in the `@Module({ providers })` decorator the
      // rule scans. It reports a false positive for every injectable.
      '@darraghor/nestjs-typed/injectable-should-be-provided': 'off',
    },
  },
]
