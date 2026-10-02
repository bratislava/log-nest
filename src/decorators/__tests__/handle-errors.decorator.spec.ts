import { describe, expect, it } from 'vitest'

import { loggedFields, loggedLines } from '../../__tests__/logs'
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
    expect(isLogfmt(loggedLines()[0])).toBe(true)
  })

  it('also catches a synchronous throw from a method that is not async', async () => {
    class TestClass {
      @HandleErrors('Test error handler')
      // eslint-disable-next-line @typescript-eslint/promise-function-async -- deliberately sync: @HandleErrors makes this return a Promise at runtime, TS just can't see that
      testMethod(): Promise<string> {
        throw new Error('sync boom, no promise wrapper')
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
      message: 'sync boom, no promise wrapper',
      methodName: 'testMethod',
      stack: expect.stringMatching(/^Error: sync boom, no promise wrapper\n/),
    })
  })

  it('logs a thrown primitive as its content, with the method name', async () => {
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
      methodName: 'testMethod',
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

  it('logs a frozen error with the method name', async () => {
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
      methodName: 'testMethod',
      stack: expect.stringMatching(/^Error: frozen\n/),
    })
  })

  it('throws a TypeError when applied to something that is not a method', () => {
    expect(() => HandleErrors()({}, 'notAMethod', { value: 42 })).toThrow(
      new TypeError('@HandleErrors can only be applied to methods, got number'),
    )
  })
})
