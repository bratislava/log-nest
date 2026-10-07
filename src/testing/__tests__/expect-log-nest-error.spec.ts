import { HttpStatus } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { ErrorEnum } from '../../errors/base-errors.enum'
import { ErrorFactoryService } from '../../errors/error-factory.service'
import {
  expectLogNestError,
  LogNestErrorExpectation,
} from '../expect-log-nest-error'

const errorFactory = new ErrorFactoryService({
  alertReporting: [ErrorEnum.DATABASE_ERROR],
})
const formId = 'form-123'
const cause = new Error('connection reset')
const thrown = errorFactory.InternalServerErrorException({
  errorEnum: ErrorEnum.DATABASE_ERROR,
  message: `Saving form failed. Form id: ${formId}`,
  console: { formId, attempt: 2 },
  error: cause,
})

describe('expectLogNestError', () => {
  it('should match every field of a thrown exception', () => {
    expect(() => {
      throw thrown
    }).toThrow(
      expectLogNestError({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        errorEnum: ErrorEnum.DATABASE_ERROR,
        message: `Saving form failed. Form id: ${formId}`,
        console: { formId, attempt: 2 },
        error: cause,
        alert: 1,
      }),
    )
  })

  it('should check only the given fields', () => {
    expect(() => {
      throw thrown
    }).toThrow(expectLogNestError({ errorEnum: ErrorEnum.DATABASE_ERROR }))
  })

  it('should accept asymmetric matchers', () => {
    expect(() => {
      throw thrown
    }).toThrow(
      expectLogNestError({
        message: expect.stringContaining(formId),
        console: { attempt: expect.any(Number) },
      }),
    )
  })

  it('should match console by containment', () => {
    expect(() => {
      throw thrown
    }).toThrow(expectLogNestError({ console: { formId } }))
  })

  it('should accept a matcher for a string console', () => {
    const error = errorFactory.BadRequestException({
      errorEnum: ErrorEnum.BAD_REQUEST_ERROR,
      message: 'Invalid form',
      console: `Validation failed for form ${formId}`,
    })

    expect(() => {
      throw error
    }).toThrow(expectLogNestError({ console: expect.stringContaining(formId) }))
    expect(error).not.toEqual(
      expectLogNestError({ console: expect.stringContaining('other-form') }),
    )
  })

  it('should match a cause by name and message, as the factory stores it', () => {
    expect(() => {
      throw thrown
    }).toThrow(expectLogNestError({ error: new Error('connection reset') }))
  })

  it('should match a log-nest error cause including its console', () => {
    const innerError = (formIdOfCause: string) =>
      errorFactory.BadRequestException({
        errorEnum: ErrorEnum.BAD_REQUEST_ERROR,
        message: 'Invalid form',
        console: { formId: formIdOfCause },
      })
    const error = errorFactory.InternalServerErrorException({
      errorEnum: ErrorEnum.INTERNAL_SERVER_ERROR,
      message: 'Sending form failed',
      error: innerError(formId),
    })

    expect(() => {
      throw error
    }).toThrow(expectLogNestError({ error: innerError(formId) }))
    expect(error).not.toEqual(
      expectLogNestError({ error: innerError('other-form') }),
    )
  })

  it('should match a cause that is not an Error', () => {
    const error = errorFactory.InternalServerErrorException({
      errorEnum: ErrorEnum.DATABASE_ERROR,
      message: 'Saving form failed',
      error: { code: 'P2002', target: ['email'] },
    })

    expect(() => {
      throw error
    }).toThrow(
      expectLogNestError({ error: { code: 'P2002', target: ['email'] } }),
    )
    expect(error).not.toEqual(expectLogNestError({ error: { code: 'P2003' } }))
  })

  it('should work with rejects', async () => {
    await expect(Promise.reject(thrown)).rejects.toThrow(
      expectLogNestError({
        errorEnum: ErrorEnum.DATABASE_ERROR,
        message: expect.stringContaining(formId),
        error: cause,
      }),
    )
  })

  it('should work with toHaveBeenCalledWith', () => {
    const logError = vi.fn()

    logError('Saving failed', thrown)

    expect(logError).toHaveBeenCalledWith(
      expect.any(String),
      expectLogNestError({ errorEnum: ErrorEnum.DATABASE_ERROR }),
    )
  })

  it('should match an exception without console and cause', () => {
    expect(() => {
      throw errorFactory.NotFoundException({
        errorEnum: ErrorEnum.NOT_FOUND_ERROR,
        message: 'Not found',
      })
    }).toThrow(
      expectLogNestError({
        console: undefined,
        error: undefined,
        alert: 0,
      }),
    )
  })

  it.each<[string, LogNestErrorExpectation]>([
    ['status', { status: HttpStatus.NOT_FOUND }],
    ['errorEnum', { errorEnum: ErrorEnum.NOT_FOUND_ERROR }],
    ['message', { message: expect.stringContaining('other-form') }],
    ['console value', { console: { formId: 'other-form' } }],
    ['console key', { console: { userId: 'user-1' } }],
    ['error', { error: new Error('timeout') }],
    ['missing error', { error: undefined }],
    ['alert', { alert: 0 }],
  ])('should not match a different %s', (_field, expectation) => {
    expect(thrown).not.toEqual(expectLogNestError(expectation))
  })

  it('should not match an error that is not an HttpException', () => {
    expect(new Error('plain')).not.toEqual(expectLogNestError({}))
  })
})
