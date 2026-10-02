import { createNestConfig } from '@bratislava/eslint-config-nest'
import vitest from '@vitest/eslint-plugin'

export default [
  ...createNestConfig({
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    files: ['**/__tests__/**/*.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      // the shared config sets up eslint-plugin-jest; swap in its vitest counterpart
      'jest/unbound-method': 'off',
      'vitest/unbound-method': 'error',
      'vitest/expect-expect': [
        'error',
        {
          assertFunctionNames: [
            'expect',
            'assert',
            'expectTypeOf',
            'assertType',
          ],
        },
      ],
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
