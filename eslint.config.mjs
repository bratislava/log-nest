import { createNestConfig } from '@bratislava/eslint-config-nest'

export default [
  ...createNestConfig({
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    files: ['**/*.spec.ts', '**/*_test_.ts'],
  },
]
