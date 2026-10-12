import { HttpStatus, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { ErrorEnum } from '../../errors/base-errors.enum'
import { ErrorFactoryService } from '../../errors/error-factory.service'
import {
  LogNestErrorExpectation,
  logNestMatchers,
} from '../to-be-log-nest-error'

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
  alert: 1,
}
const fullExpectation: LogNestErrorExpectation = {
  ...expectationWithoutConsole,
  console: { formId, attempt: 2 },
}

describe('toBeLogNestError', () => {
  it('should match every field of an exception', () => {
    expect(thrown).toBeLogNestError(fullExpectation)
  })

  it('should check only the given fields', () => {
    expect(thrown).toBeLogNestError({ errorEnum: ErrorEnum.DATABASE_ERROR })
  })

  it('should accept asymmetric matchers', () => {
    expect(thrown).toBeLogNestError({
      status: expect.any(Number),
      message: expect.stringContaining(formId),
      console: { attempt: expect.any(Number) },
      error: expect.any(KnownRequestError),
    })
  })

  it('should match console by containment', () => {
    expect(thrown).toBeLogNestError({ console: { formId } })
  })

  it('should accept a matcher for a string console', () => {
    const error = errorFactory.BadRequestException({
      errorEnum: ErrorEnum.BAD_REQUEST_ERROR,
      message: 'Invalid form',
      console: `Validation failed for form ${formId}`,
    })

    expect(error).toBeLogNestError({
      console: expect.stringContaining(formId),
    })
    expect(error).not.toBeLogNestError({
      console: expect.stringContaining('other-form'),
    })
  })

  describe('error', () => {
    it('should match only the same Error instance', () => {
      expect(thrown).toBeLogNestError({ error: cause })
      expect(thrown).not.toBeLogNestError({
        error: new KnownRequestError('Unique constraint failed', 'P2002'),
      })
    })

    it('should match the fields of the cause', () => {
      expect(thrown).toBeLogNestError({ error: { code: 'P2002' } })
      expect(thrown).not.toBeLogNestError({ error: { code: 'P2003' } })
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

      expect(error).toBeLogNestError({ error: innerError })
      expect(error.cause).toBeLogNestError({ console: { formId } })
    })

    it('should match a cause that is not an Error', () => {
      const error = errorFactory.InternalServerErrorException({
        errorEnum: ErrorEnum.DATABASE_ERROR,
        message: 'Saving form failed',
        error: { code: 'P2002', target: ['email'] },
      })

      expect(error).toBeLogNestError({ error: { code: 'P2002' } })
      expect(error).not.toBeLogNestError({ error: { code: 'P2003' } })
    })
  })

  describe('exact', () => {
    it('should match when every field is given', () => {
      expect(thrown).toBeLogNestError(fullExpectation, { exact: true })
    })

    it('should not match when a set field is left out', () => {
      expect(thrown).toBeLogNestError(expectationWithoutConsole)
      expect(thrown).not.toBeLogNestError(expectationWithoutConsole, {
        exact: true,
      })
    })

    it('should not match a partial console or cause', () => {
      expect(thrown).not.toBeLogNestError(
        { ...fullExpectation, console: { formId } },
        { exact: true },
      )

      const error = errorFactory.InternalServerErrorException({
        errorEnum: ErrorEnum.DATABASE_ERROR,
        message: 'Saving form failed',
        error: { code: 'P2002', target: ['email'] },
      })
      expect(error).not.toBeLogNestError(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          errorEnum: ErrorEnum.DATABASE_ERROR,
          message: 'Saving form failed',
          error: { code: 'P2002' },
          alert: 1,
        },
        { exact: true },
      )
    })
  })

  it('should work with rejects', async () => {
    await expect(Promise.reject(thrown)).rejects.toBeLogNestError({
      errorEnum: ErrorEnum.DATABASE_ERROR,
      error: cause,
    })
  })

  it('should work as an asymmetric matcher in toThrow', () => {
    expect(() => {
      throw thrown
    }).toThrow(expect.toBeLogNestError({ errorEnum: ErrorEnum.DATABASE_ERROR }))
  })

  it('should work as an asymmetric matcher in toHaveBeenCalledWith', () => {
    const logError = vi.fn()

    logError('Saving failed', thrown)

    expect(logError).toHaveBeenCalledWith(
      expect.any(String),
      expect.toBeLogNestError({ errorEnum: ErrorEnum.DATABASE_ERROR }),
    )
  })

  it('should match an exception without console and cause', () => {
    expect(
      errorFactory.NotFoundException({
        errorEnum: ErrorEnum.NOT_FOUND_ERROR,
        message: 'Not found',
      }),
    ).toBeLogNestError({ console: undefined, error: undefined, alert: 0 })
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
    expect(thrown).not.toBeLogNestError(expectation)
  })

  it('should not match an exception not created by ErrorFactoryService', () => {
    expect(new Error('plain')).not.toBeLogNestError({})
    expect(new NotFoundException()).not.toBeLogNestError({})
  })

  it('should show the mismatching fields in the failure message', () => {
    expect(() => {
      expect(thrown).toBeLogNestError({ status: HttpStatus.NOT_FOUND })
    }).toThrow(/500[\s\S]*404/)
  })
})
