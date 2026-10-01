import { HttpException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { ErrorFactoryService } from '../../errors/error-factory.service'
import { ErrorSymbols } from '../../errors/error-symbols'
import {
  CatchDatabaseError,
  type HasErrorFactoryService,
} from '../catch-database-error.decorator'

class Repository implements HasErrorFactoryService {
  errorFactoryService = new ErrorFactoryService()

  @CatchDatabaseError()
  syncThrows(): never {
    throw new Error('connection lost')
  }

  @CatchDatabaseError()
  async asyncRejects(): Promise<never> {
    return Promise.reject(new Error('connection lost'))
  }

  @CatchDatabaseError()
  syncValue(): number {
    return 42
  }

  @CatchDatabaseError()
  async asyncValue(): Promise<number> {
    return Promise.resolve(42)
  }
}

describe('CatchDatabaseError', () => {
  it('turns a sync throw into a 422 DATABASE_ERROR, thrown synchronously, with the original error as the cause', () => {
    let thrown: unknown
    try {
      new Repository().syncThrows()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(HttpException)
    expect((thrown as HttpException).getStatus()).toBe(422)
    expect((thrown as HttpException).getResponse()).toEqual({
      statusCode: 422,
      status: 'Unprocessable entity',
      errorName: 'DATABASE_ERROR',
      message: 'There was database error.',
      [ErrorSymbols.alert]: 0,
      [ErrorSymbols.errorCause]: 'Error',
      [ErrorSymbols.causedByMessage]: 'connection lost',
    })
    expect((thrown as HttpException).stack).toMatch(
      /\nWas directly caused by:\n\nError: connection lost\n/,
    )
  })

  it('turns an async rejection into the same 422 DATABASE_ERROR rejection', async () => {
    const thrown: unknown = await new Repository()
      .asyncRejects()
      .catch((error: unknown) => error)

    // same mapError as the sync path, which the test above checks in full
    expect(thrown).toBeInstanceOf(HttpException)
    expect((thrown as HttpException).getStatus()).toBe(422)
    expect((thrown as HttpException).getResponse()).toMatchObject({
      errorName: 'DATABASE_ERROR',
    })
  })

  it('keeps a sync method sync: its value comes back directly, not as a Promise', () => {
    expect(new Repository().syncValue()).toBe(42)
  })

  it('passes an async method its resolved value unchanged', async () => {
    await expect(new Repository().asyncValue()).resolves.toBe(42)
  })

  it('throws an explicit error when the class has no errorFactoryService to build the exception with', () => {
    class BrokenRepository implements HasErrorFactoryService {
      errorFactoryService = undefined as unknown as ErrorFactoryService

      @CatchDatabaseError()
      run(): never {
        throw new Error('connection lost')
      }
    }

    expect(() => new BrokenRepository().run()).toThrow(
      new Error(
        "CatchDatabaseError decorator requires the class to have a 'errorFactoryService' property. " +
          'Please ensure BrokenRepository implements HasErrorFactoryService.',
      ),
    )
  })
})
