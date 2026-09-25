import { describe, expect, it } from 'vitest'

import { loggedFields, loggedLines } from '../../__tests__/logs'
import { ErrorEnum } from '../../errors/base-errors.enum'
import { ErrorFactoryService } from '../../errors/error-factory.service'
import { ErrorSymbols } from '../../errors/error-symbols'
import { isLogfmt } from '../../logging/logfmt'
import { HandleErrors } from '../handle-errors.decorator'

/** The one line the test logged, parsed. */
function loggedLine(): Record<string, string> {
  const fields = loggedFields()
  expect(fields).toHaveLength(1)
  return fields[0]
}

describe('HandleErrors', () => {
  it('passes the return value through and logs nothing when the method succeeds', async () => {
    class TestClass {
      @HandleErrors('Test error handler')
      async testMethod(): Promise<string> {
        return Promise.resolve('result')
      }
    }

    await expect(new TestClass().testMethod()).resolves.toBe('result')
    expect(loggedFields()).toEqual([])
  })

  it('swallows a thrown Error, resolving to null, and logs it with the method name', async () => {
    class TestClass {
      @HandleErrors('Test error handler')
      async testMethod(): Promise<void> {
        return Promise.reject(new Error('This is a test error'))
      }
    }

    await expect(new TestClass().testMethod()).resolves.toBeNull()

    expect(loggedLine()).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'ERROR',
      context: 'Test error handler',
      errorType: 'Error',
      message: 'This is a test error',
      methodName: 'testMethod',
      stack: expect.stringMatching(/^Error: This is a test error\n/),
    })
  })

  it('logs an HttpException with its status, error enum, cause and console fields', async () => {
    class TestClass {
      private errorFactoryService = new ErrorFactoryService({
        alertReporting: [ErrorEnum.INTERNAL_SERVER_ERROR],
      })

      @HandleErrors('Test error handler')
      async testMethod(): Promise<void> {
        return Promise.reject(
          this.errorFactoryService.BadRequestException({
            errorEnum: ErrorEnum.INTERNAL_SERVER_ERROR,
            message: 'Error message',
            console: 'Console error',
            error: new Error('Caused by error message test'),
          }),
        )
      }
    }

    await expect(new TestClass().testMethod()).resolves.toBeNull()

    expect(loggedLine()).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'ERROR',
      context: 'Test error handler',
      errorType: 'HttpException',
      statusCode: '400',
      status: 'Bad Request',
      errorName: 'INTERNAL_SERVER_ERROR',
      message: 'Error message',
      alert: '1',
      errorCause: 'Error',
      causedByMessage: 'Caused by error message test',
      console: 'Console error',
      methodName: 'testMethod',
      stack: expect.stringMatching(
        /^HttpException: .*Was directly caused by:/s,
      ),
    })
  })

  it('logs a thrown primitive as its content', async () => {
    class TestClass {
      @HandleErrors('Test error handler')
      async testMethod(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberately not an Error
        return Promise.reject('a plain string value')
      }
    }

    await expect(new TestClass().testMethod()).resolves.toBeNull()

    expect(loggedLine()).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'ERROR',
      context: 'Test error handler',
      message: 'a plain string value',
    })
  })

  it('tags a thrown plain object with the method name too', async () => {
    class TestClass {
      @HandleErrors('Test error handler')
      async testMethod(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberately not an Error
        return Promise.reject({ reason: 'not an Error' })
      }
    }

    await expect(new TestClass().testMethod()).resolves.toBeNull()

    expect(loggedLine()).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'ERROR',
      context: 'Test error handler',
      reason: 'not an Error',
      methodName: 'testMethod',
    })
  })

  it('keeps a methodName the error already carries instead of overwriting it', async () => {
    class TestClass {
      @HandleErrors('Test error handler')
      async testMethod(): Promise<void> {
        return Promise.reject(
          Object.assign(new Error('from deeper down'), {
            [ErrorSymbols.methodName]: 'innerMethod',
          }),
        )
      }
    }

    await expect(new TestClass().testMethod()).resolves.toBeNull()

    expect(loggedLine().methodName).toBe('innerMethod')
  })

  it('still logs and swallows a frozen error it cannot tag', async () => {
    class TestClass {
      @HandleErrors('Test error handler')
      async testMethod(): Promise<void> {
        return Promise.reject(Object.freeze(new Error('frozen')))
      }
    }

    await expect(new TestClass().testMethod()).resolves.toBeNull()

    expect(loggedLine()).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'ERROR',
      context: 'Test error handler',
      errorType: 'Error',
      message: 'frozen',
      stack: expect.stringMatching(/^Error: frozen\n/),
    })
  })

  it('logs a single well-formed logfmt line', async () => {
    class TestClass {
      @HandleErrors('Test error handler')
      async testMethod(): Promise<void> {
        return Promise.reject(new Error('This is a test error'))
      }
    }

    await new TestClass().testMethod()

    expect(loggedLines()).toHaveLength(1)
    const [line] = loggedLines()
    expect(isLogfmt(line)).toBe(true)
  })

  it('throws a TypeError when applied to something that is not a method', () => {
    expect(() => HandleErrors()({}, 'notAMethod', { value: 42 })).toThrow(
      new TypeError('@HandleErrors can only be applied to methods, got number'),
    )
  })
})
