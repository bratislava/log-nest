import { createNestConfig } from '@bratislava/eslint-config-nest'

export default [
  ...createNestConfig({
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    files: ['**/*.spec.ts', '**/*_test_.ts'],
    rules: {
      // Test fixtures are throwaway controllers/modules defined inline: no
      // Swagger surface, and the static "is it in a module?" check can't see
      // modules built inside a factory.
      '@darraghor/nestjs-typed/controllers-should-supply-api-tags': 'off',
      '@darraghor/nestjs-typed/api-method-should-specify-api-response': 'off',
      '@darraghor/nestjs-typed/injectable-should-be-provided': 'off',
      // supertest / app.getHttpServer() are loosely typed; not worth wrapping in tests.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
]
