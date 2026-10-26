import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { ErrorEnum } from '../../errors/base-errors.enum'
import { ErrorFactoryService } from '../../errors/error-factory.service'
import { ErrorSymbols } from '../../errors/error-symbols'
import { ResponseErrorInternalDto } from '../../errors/response-error.dto'
import {
  LogNestErrorExpectation,
  logNestMatchers,
} from '../log-nest-error-matchers'

expect.extend(logNestMatchers)

class KnownRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
  }
}

const errorFactory = new ErrorFactoryService({
  alertReporting: [ErrorEnum.DATABASE_ERROR],
})
const formId = 'form-123'
const cause = new KnownRequestError('Unique constraint failed', 'P2002')
const thrown = errorFactory.InternalServerErrorException({
  errorEnum: ErrorEnum.DATABASE_ERROR,
  message: `Saving form failed. Form id: ${formId}`,
  console: { formId, attempt: 2 },
  error: cause,
})
const expectationWithoutConsole: LogNestErrorExpectation = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  errorEnum: ErrorEnum.DATABASE_ERROR,
  message: `Saving form failed. Form id: ${formId}`,
  error: cause,
  alert: true,
}
const fullExpectation: LogNestErrorExpectation = {
  ...expectationWithoutConsole,
  console: { formId, attempt: 2 },
}

function failureOf(assertion: () => void) {
  try {
    assertion()
  } catch (error) {
    return error as Error & { actual?: unknown; expected?: unknown }
  }
  throw new Error('expected the assertion to fail')
}

describe('toBeLogNestError', () => {
  it('should pass for an exception from ErrorFactoryService', () => {
    expect(thrown).toBeLogNestError()
  })

  it('should not pass for an exception not created by ErrorFactoryService', () => {
    expect(new Error('plain')).not.toBeLogNestError()
    expect(new NotFoundException()).not.toBeLogNestError()
  })

  it('should not pass for a factory-shaped exception without the raw error', () => {
    const response: ResponseErrorInternalDto = {
      statusCode: HttpStatus.NOT_FOUND,
      status: 'Not found',
      errorName: ErrorEnum.NOT_FOUND_ERROR,
      message: 'Not found',
      [ErrorSymbols.alert]: 0,
    }
    const copied = new HttpException(response, HttpStatus.NOT_FOUND)

    expect(copied).not.toBeLogNestError()
  })
})

describe('toMatchLogNestError', () => {
  it('should match every field of an exception', () => {
    expect(thrown).toMatchLogNestError(fullExpectation)
  })

  it('should check only the given fields', () => {
    expect(thrown).toMatchLogNestError({ errorEnum: ErrorEnum.DATABASE_ERROR })
  })

  it('should accept asymmetric matchers', () => {
    expect(thrown).toMatchLogNestError({
      status: expect.any(Number),
      message: expect.stringContaining(formId),
      console: { attempt: expect.any(Number) },
      error: expect.any(KnownRequestError),
      alert: expect.any(Boolean),
    })
  })

  it('should match console by containment', () => {
    expect(thrown).toMatchLogNestError({ console: { formId } })
  })

  it('should accept a matcher for a string console', () => {
    const error = errorFactory.BadRequestException({
      errorEnum: ErrorEnum.BAD_REQUEST_ERROR,
      message: 'Invalid form',
      console: `Validation failed for form ${formId}`,
    })

    expect(error).toMatchLogNestError({
      console: expect.stringContaining(formId),
    })
    expect(error).not.toMatchLogNestError({
      console: expect.stringContaining('other-form'),
    })
  })

  it('should compare sets and maps by their contents', () => {
    const error = errorFactory.BadRequestException({
      errorEnum: ErrorEnum.BAD_REQUEST_ERROR,
      message: 'Invalid form',
      console: { ids: new Set([1]), byId: new Map([[1, 'a']]) },
    })

    expect(error).toMatchLogNestError({ console: { ids: new Set([1]) } })
    expect(error).not.toMatchLogNestError({ console: { ids: new Set([2]) } })
    expect(error).not.toMatchLogNestError({
      console: { byId: new Map([[1, 'b']]) },
    })
  })

  describe('error', () => {
    it('should match only the same Error instance by default', () => {
      expect(thrown).toMatchLogNestError({ error: cause })
      expect(thrown).not.toMatchLogNestError({
        error: new KnownRequestError('Unique constraint failed', 'P2002'),
      })
    })

    it('should not compare the same Error instance deeply', () => {
      const unreadable = Object.defineProperty(new Error('boom'), 'details', {
        enumerable: true,
        get() {
          throw new Error('a deep comparison read this field')
        },
      })
      const error = errorFactory.InternalServerErrorException({
        errorEnum: ErrorEnum.DATABASE_ERROR,
        message: 'Saving form failed',
        error: unreadable,
      })

      // a deep comparison would read `details` and throw; passing proves the
      // same instance is matched by identity alone
      expect(error).toMatchLogNestError({ error: unreadable })
      expect(error).toMatchLogNestError(
        { error: unreadable },
        { errorComparison: 'toEqual' },
      )
    })

    it('should not check the cause when error is left out', () => {
      const withoutCause = errorFactory.NotFoundException({
        errorEnum: ErrorEnum.NOT_FOUND_ERROR,
        message: 'Not found',
      })

      expect(thrown).toMatchLogNestError({
        errorEnum: ErrorEnum.DATABASE_ERROR,
      })
      expect(withoutCause).toMatchLogNestError({
        errorEnum: ErrorEnum.NOT_FOUND_ERROR,
      })
    })

    it('should not match an expected Error when there is no cause', () => {
      const withoutCause = errorFactory.NotFoundException({
        errorEnum: ErrorEnum.NOT_FOUND_ERROR,
        message: 'Not found',
      })

      expect(withoutCause).not.toMatchLogNestError({ error: cause })
      expect(withoutCause).not.toMatchLogNestError(
        { error: cause },
        { errorComparison: 'toEqual' },
      )
    })

    it('should match an equal Error instance with errorComparison toEqual', () => {
      expect(thrown).toMatchLogNestError(
        { error: new KnownRequestError('Unique constraint failed', 'P2002') },
        { errorComparison: 'toEqual' },
      )
      expect(thrown).not.toMatchLogNestError(
        { error: new KnownRequestError('Unique constraint failed', 'P2003') },
        { errorComparison: 'toEqual' },
      )
      expect(thrown).not.toMatchLogNestError(
        { error: new Error('Unique constraint failed') },
        { errorComparison: 'toEqual' },
      )
    })

    it('should match the same instance and reject a different message with errorComparison toEqual', () => {
      expect(thrown).toMatchLogNestError(
        { error: cause },
        { errorComparison: 'toEqual' },
      )
      expect(thrown).not.toMatchLogNestError(
        { error: new KnownRequestError('Other message', 'P2002') },
        { errorComparison: 'toEqual' },
      )
    })

    it('should compare an expected Error as a whole, not as a subset', () => {
      const withExtraField = Object.assign(
        new KnownRequestError('Unique constraint failed', 'P2002'),
        { meta: { target: ['email'] } },
      )

      expect(thrown).not.toMatchLogNestError(
        { error: withExtraField },
        { errorComparison: 'toEqual' },
      )
    })

    it('should apply asymmetric matchers to the cause', () => {
      expect(thrown).toMatchLogNestError({
        error: expect.any(KnownRequestError),
      })
      expect(thrown).toMatchLogNestError({
        error: expect.objectContaining({ code: 'P2002' }),
      })
      expect(thrown).not.toMatchLogNestError({ error: expect.any(TypeError) })
    })

    it('should match the fields of the cause', () => {
      expect(thrown).toMatchLogNestError({ error: { code: 'P2002' } })
      expect(thrown).not.toMatchLogNestError({ error: { code: 'P2003' } })
    })

    it('should match a log-nest error cause', () => {
      const innerError = errorFactory.BadRequestException({
        errorEnum: ErrorEnum.BAD_REQUEST_ERROR,
        message: 'Invalid form',
        console: { formId },
      })
      const error = errorFactory.InternalServerErrorException({
        errorEnum: ErrorEnum.INTERNAL_SERVER_ERROR,
        message: 'Sending form failed',
        error: innerError,
      })

      expect(error).toMatchLogNestError({ error: innerError })
      expect(error).toMatchLogNestError({
        error: expect.toMatchLogNestError({ console: { formId } }),
      })
      expect(error).not.toMatchLogNestError({
        error: expect.toMatchLogNestError({ console: { formId: 'other' } }),
      })
    })

    it('should match a cause that is not an Error', () => {
      const error = errorFactory.InternalServerErrorException({
        errorEnum: ErrorEnum.DATABASE_ERROR,
        message: 'Saving form failed',
        error: { code: 'P2002', target: ['email'] },
      })

      expect(error).toMatchLogNestError({ error: { code: 'P2002' } })
      expect(error).not.toMatchLogNestError({ error: { code: 'P2003' } })
    })

    it('should compare sets and maps in the cause by their contents', () => {
      const error = errorFactory.InternalServerErrorException({
        errorEnum: ErrorEnum.DATABASE_ERROR,
        message: 'Saving form failed',
        error: { ids: new Set([1]), byId: new Map([[1, 'a']]) },
      })

      expect(error).toMatchLogNestError({ error: { ids: new Set([1]) } })
      expect(error).not.toMatchLogNestError({ error: { ids: new Set([2]) } })
      expect(error).not.toMatchLogNestError({
        error: { byId: new Map([[1, 'b']]) },
      })
    })
  })

  it('should work with rejects', async () => {
    await expect(Promise.reject(thrown)).rejects.toMatchLogNestError({
      errorEnum: ErrorEnum.DATABASE_ERROR,
      error: cause,
    })
  })

  it('should work as an asymmetric matcher in toThrow', () => {
    expect(() => {
      throw thrown
    }).toThrow(
      expect.toMatchLogNestError({ errorEnum: ErrorEnum.DATABASE_ERROR }),
    )
  })

  it('should work as an asymmetric matcher in toHaveBeenCalledWith', () => {
    const logError = vi.fn()

    logError('Saving failed', thrown)

    expect(logError).toHaveBeenCalledWith(
      expect.any(String),
      expect.toMatchLogNestError({ errorEnum: ErrorEnum.DATABASE_ERROR }),
    )
  })

  it('should match an exception without console and cause', () => {
    expect(
      errorFactory.NotFoundException({
        errorEnum: ErrorEnum.NOT_FOUND_ERROR,
        message: 'Not found',
      }),
    ).toMatchLogNestError({
      console: undefined,
      error: undefined,
      alert: false,
    })
  })

  it.each<[string, LogNestErrorExpectation]>([
    ['status', { status: HttpStatus.NOT_FOUND }],
    ['errorEnum', { errorEnum: ErrorEnum.NOT_FOUND_ERROR }],
    ['message', { message: expect.stringContaining('other-form') }],
    ['console value', { console: { formId: 'other-form' } }],
    ['console key', { console: { userId: 'user-1' } }],
    ['error', { error: new Error('timeout') }],
    ['missing error', { error: undefined }],
    ['alert', { alert: false }],
  ])('should not match a different %s', (_field, expectation) => {
    expect(thrown).not.toMatchLogNestError(expectation)
  })

  it('should not match an exception not created by ErrorFactoryService', () => {
    expect(new Error('plain')).not.toMatchLogNestError({})
    expect(new NotFoundException()).not.toMatchLogNestError({})
  })

  describe('failure output', () => {
    it('should keep the values out of the message and diff only the checked fields', () => {
      const failure = failureOf(() => {
        expect(thrown).toMatchLogNestError({
          status: HttpStatus.NOT_FOUND,
          console: { formId: 'other-form' },
        })
      })

      expect(failure.message).toBe(
        'expected log-nest error to match the expectation',
      )
      expect(failure.actual).toEqual({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        console: { formId },
      })
    })

    it('should explain a different Error instance with the same structure', () => {
      const failure = failureOf(() => {
        expect(thrown).toMatchLogNestError({
          error: new KnownRequestError('Unique constraint failed', 'P2002'),
        })
      })

      expect(failure.message).toContain('different Error instance')
      expect(failure.message).toContain('errorComparison')
      expect(failure.actual).toBeUndefined()
    })

    it('should also mention a different instance when other fields differ, keeping the diff', () => {
      const failure = failureOf(() => {
        expect(thrown).toMatchLogNestError({
          errorEnum: ErrorEnum.NOT_FOUND_ERROR,
          error: new KnownRequestError('Unique constraint failed', 'P2002'),
        })
      })

      expect(failure.message).toContain('Besides the differences below')
      expect(failure.message).toContain('different Error instance')
      expect(failure.actual).toMatchObject({
        errorEnum: ErrorEnum.DATABASE_ERROR,
      })
    })

    it('should not mention a different instance when the Error differs in structure', () => {
      const failure = failureOf(() => {
        expect(thrown).toMatchLogNestError({
          error: new KnownRequestError('Unique constraint failed', 'P2003'),
        })
      })

      expect(failure.message).toBe(
        'expected log-nest error to match the expectation',
      )
    })

    it('should not diff a failing .not', () => {
      const failure = failureOf(() => {
        expect(thrown).not.toMatchLogNestError({
          errorEnum: ErrorEnum.DATABASE_ERROR,
        })
      })

      expect(failure.message).toBe(
        'expected log-nest error not to match the expectation',
      )
      expect(failure.actual).toBeUndefined()
    })
  })
})

describe('toEqualLogNestError', () => {
  it('should match when every field is given', () => {
    expect(thrown).toEqualLogNestError(fullExpectation)
  })

  it('should not match when a set field is left out', () => {
    expect(thrown).toMatchLogNestError(expectationWithoutConsole)
    expect(thrown).not.toEqualLogNestError(expectationWithoutConsole)
  })

  it('should not match a partial console or cause', () => {
    expect(thrown).not.toEqualLogNestError({
      ...fullExpectation,
      console: { formId },
    })

    const error = errorFactory.InternalServerErrorException({
      errorEnum: ErrorEnum.DATABASE_ERROR,
      message: 'Saving form failed',
      error: { code: 'P2002', target: ['email'] },
    })
    expect(error).not.toEqualLogNestError({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorEnum: ErrorEnum.DATABASE_ERROR,
      message: 'Saving form failed',
      error: { code: 'P2002' },
      alert: true,
    })
    expect(error).toEqualLogNestError({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorEnum: ErrorEnum.DATABASE_ERROR,
      message: 'Saving form failed',
      error: { code: 'P2002', target: ['email'] },
      alert: true,
    })
  })

  it('should compare sets by their contents', () => {
    const error = errorFactory.BadRequestException({
      errorEnum: ErrorEnum.BAD_REQUEST_ERROR,
      message: 'Invalid form',
      console: { ids: new Set([1]) },
    })
    const expectation: LogNestErrorExpectation = {
      status: HttpStatus.BAD_REQUEST,
      errorEnum: ErrorEnum.BAD_REQUEST_ERROR,
      message: 'Invalid form',
      alert: false,
    }

    expect(error).toEqualLogNestError({
      ...expectation,
      console: { ids: new Set([1]) },
    })
    expect(error).not.toEqualLogNestError({
      ...expectation,
      console: { ids: new Set([2]) },
    })
  })

  it('should diff every field on failure', () => {
    const failure = failureOf(() => {
      expect(thrown).toEqualLogNestError({ status: HttpStatus.NOT_FOUND })
    })

    expect(failure.message).toBe(
      'expected log-nest error to equal the expectation',
    )
    expect(failure.actual).toMatchObject({
      errorEnum: ErrorEnum.DATABASE_ERROR,
      console: { formId, attempt: 2 },
    })
  })
})

describe('toThrowLogNestError', () => {
  const throwing = () => {
    throw thrown
  }

  it('should match what a function throws', () => {
    expect(throwing).toThrowLogNestError({
      errorEnum: ErrorEnum.DATABASE_ERROR,
      console: { formId },
    })
    expect(throwing).not.toThrowLogNestError({
      errorEnum: ErrorEnum.NOT_FOUND_ERROR,
    })
  })

  it('should only check the thrown type without an expectation', () => {
    expect(throwing).toThrowLogNestError()
    expect(() => {
      throw new Error('plain')
    }).not.toThrowLogNestError()
  })

  it('should not pass when the function does not throw', () => {
    expect(() => undefined).not.toThrowLogNestError()
  })

  describe('misuse', () => {
    it('should point to .rejects for an async function, even with .not', () => {
      const asyncThrowing = async () => Promise.reject(thrown)

      expect(() => {
        expect(asyncThrowing).toThrowLogNestError()
      }).toThrow(/returned a promise[\s\S]*\.rejects/)
      expect(() => {
        expect(asyncThrowing).not.toThrowLogNestError()
      }).toThrow(/returned a promise/)
    })

    it('should refuse a value that is not a function, even with .not', () => {
      expect(() => {
        expect(42).toThrowLogNestError()
      }).toThrow(/expects a function, or a promise with \.rejects/)
      expect(() => {
        expect(42).not.toThrowLogNestError()
      }).toThrow(/expects a function, or a promise with \.rejects/)
    })

    it('should treat a thenable that is not a Promise like a promise', () => {
      const rejected = Promise.reject(thrown)
      const thenable: PromiseLike<never> = {
        then: async (onFulfilled, onRejected) =>
          rejected.then(onFulfilled, onRejected),
      }

      expect(() => {
        expect(() => thenable).not.toThrowLogNestError()
      }).toThrow(/returned a promise/)
      expect(() => {
        expect(thenable).not.toThrowLogNestError()
      }).toThrow(/expects a function, or a promise with \.rejects/)
    })

    it('should refuse a promise without .rejects and handle its rejection', () => {
      expect(() => {
        expect(Promise.reject(thrown)).not.toThrowLogNestError()
      }).toThrow(/expects a function, or a promise with \.rejects/)
    })

    it('should refuse .resolves without calling the resolved function', async () => {
      const resolved = vi.fn(() => {
        throw thrown
      })

      let failure: unknown
      try {
        await expect(Promise.resolve(resolved)).resolves.toThrowLogNestError()
      } catch (error) {
        failure = error
      }

      expect(failure).toBeInstanceOf(TypeError)
      expect(String(failure)).toMatch(/cannot be used with \.resolves/)
      expect(resolved).not.toHaveBeenCalled()
    })
  })

  it('should work with rejects', async () => {
    await expect(Promise.reject(thrown)).rejects.toThrowLogNestError({
      errorEnum: ErrorEnum.DATABASE_ERROR,
    })
  })
})
