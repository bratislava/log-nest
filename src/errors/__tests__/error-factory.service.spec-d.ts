import { describe, expectTypeOf, it } from 'vitest'

import { ErrorFactoryService } from '../error-factory.service'

// Type-level only: run by Vitest's typecheck mode (tsc), not executed.

describe('ErrorFactoryService error-enum default', () => {
  it('is exactly string when nothing is registered', () => {
    expectTypeOf<
      Parameters<ErrorFactoryService['BadRequestException']>[0]['errorEnum']
    >().toEqualTypeOf<string>()
  })

  it('is overridden by an explicit generic', () => {
    expectTypeOf<
      Parameters<
        ErrorFactoryService<'A' | 'B'>['BadRequestException']
      >[0]['errorEnum']
    >().toEqualTypeOf<'A' | 'B'>()
  })
})
