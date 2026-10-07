import { inspect } from 'node:util'

import { HttpException } from '@nestjs/common'
import { expect } from 'vitest'

import { errorCauseFields } from '../errors/error-cause'
import { LoggingExceptionOptions } from '../errors/error-factory.service'
import { separateLogFromResponseObj } from '../logging/logfmt'

export interface LogNestErrorExpectation extends Partial<LoggingExceptionOptions> {
  status?: number
  alert?: 0 | 1
}

/**
 * Picks the cause from a response's log fields, shaped like the `Error` a test passes.
 */
function causeOf(responseLog: Record<string, unknown>) {
  return {
    name: responseLog.errorCause,
    message: responseLog.causedByMessage,
    console: responseLog.causedByConsole,
  }
}

/**
 * Converts a thrown HttpException into a plain object comparable with the test's expectation.
 */
function exceptionToComparable(exception: HttpException) {
  const { responseMessage, responseLog } = separateLogFromResponseObj(
    exception.getResponse() as object,
  )
  return {
    status: exception.getStatus(),
    errorEnum: responseMessage.errorName,
    message: responseMessage.message,
    console: responseLog.console,
    error: causeOf(responseLog),
    alert: responseLog.alert,
  }
}

/**
 * Converts the test's expectation into the same shape as `exceptionToComparable`.
 */
function expectationToComparable(expected: LogNestErrorExpectation) {
  if (!('error' in expected)) {
    return expected
  }
  const { responseLog } = separateLogFromResponseObj(
    errorCauseFields(expected.error),
  )
  return { ...expected, error: causeOf(responseLog) }
}

function isMatch(actual: unknown, expectedComparable: object): boolean {
  if (!(actual instanceof HttpException)) {
    return false
  }
  try {
    expect(exceptionToComparable(actual)).toMatchObject(expectedComparable)
    return true
  } catch {
    return false
  }
}

export function expectLogNestError(expected: LogNestErrorExpectation): unknown {
  const expectedComparable = expectationToComparable(expected)
  return expect.toSatisfy(
    (actual: unknown) => isMatch(actual, expectedComparable),
    `LogNestError ${inspect(expectedComparable)}`,
  )
}
