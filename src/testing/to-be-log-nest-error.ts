import { HttpException } from '@nestjs/common'
import type { MatcherState, SyncMatcherResult } from 'vitest'

import { LoggingExceptionOptions } from '../errors/error-factory.service'
import { ErrorSymbols } from '../errors/error-symbols'
import { ResponseErrorInternalDto } from '../errors/response-error.dto'

export interface LogNestErrorExpectation extends Partial<LoggingExceptionOptions> {
  status?: number
  alert?: 0 | 1
}

export interface LogNestErrorMatchOptions {
  exact?: boolean
}

declare module 'vitest' {
  interface Matchers<R> {
    toBeLogNestError: (
      expected: LogNestErrorExpectation,
      options?: LogNestErrorMatchOptions,
    ) => R
  }
}

function isLogNestErrorResponse(
  response: unknown,
): response is ResponseErrorInternalDto {
  if (typeof response !== 'object' || response === null) {
    return false
  }
  const fields = response as Record<PropertyKey, unknown>
  return (
    typeof fields.statusCode === 'number' &&
    typeof fields.status === 'string' &&
    typeof fields.errorName === 'string' &&
    typeof fields.message === 'string' &&
    typeof fields[ErrorSymbols.alert] === 'number'
  )
}

function logNestErrorFields(actual: unknown) {
  if (!(actual instanceof HttpException)) {
    return undefined
  }
  const response = actual.getResponse()
  if (!isLogNestErrorResponse(response)) {
    return undefined
  }
  return {
    status: actual.getStatus(),
    errorEnum: response.errorName,
    message: response.message,
    console: response[ErrorSymbols.console],
    error: Reflect.get(actual, ErrorSymbols.originalErrorForTesting) as unknown,
    alert: response[ErrorSymbols.alert],
  }
}

function toBeLogNestError(
  this: MatcherState,
  actual: unknown,
  expected: LogNestErrorExpectation,
  { exact = false }: LogNestErrorMatchOptions = {},
): SyncMatcherResult {
  const fields = logNestErrorFields(actual)
  if (fields === undefined) {
    return {
      pass: false,
      message: () =>
        `expected ${this.utils.printReceived(actual)} to be an exception from log-nest's ErrorFactoryService`,
    }
  }

  const testers = exact
    ? this.customTesters
    : [...this.customTesters, this.utils.subsetEquality]
  const { error: expectedError, ...expectedRest } = expected
  const { error: actualError, ...actualRest } = fields

  let errorMatches: boolean
  if (expectedError instanceof Error) {
    // `equals` would accept a different Error with the same name and message.
    // For a structural match, pass a plain object or an asymmetric matcher.
    errorMatches = actualError === expectedError
  } else if (exact || 'error' in expected) {
    // `error: undefined` asserts there is no cause, unlike omitting `error`.
    errorMatches = this.equals(actualError, expectedError, testers)
  } else {
    errorMatches = true
  }
  const pass = errorMatches && this.equals(actualRest, expectedRest, testers)

  const received = exact
    ? fields
    : Object.fromEntries(
        Object.entries(fields).filter(([key]) => key in expected),
      )
  return {
    pass,
    message: () =>
      `expected log-nest error ${this.utils.printReceived(received)} ${this.isNot ? 'not ' : ''}to match${exact ? ' exactly' : ''} ${this.utils.printExpected(expected)}`,
    actual: received,
    expected,
  }
}

export const logNestMatchers = { toBeLogNestError }
