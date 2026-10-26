import { HttpException } from '@nestjs/common'
import type { MatcherState, SyncMatcherResult } from 'vitest'

import { LoggingExceptionOptions } from '../errors/error-factory.service'
import { ErrorSymbols, rawErrorSymbol } from '../errors/error-symbols'
import { ResponseErrorInternalDto } from '../errors/response-error.dto'
import { subsetForDiff } from './subset-for-diff'

export interface LogNestErrorEqualExpectation extends LoggingExceptionOptions {
  status: number
  alert?: boolean
}

export type LogNestErrorExpectation = Partial<LogNestErrorEqualExpectation>

export interface LogNestErrorMatchOptions {
  /**
   * How an expected `Error` in `error` is compared: `'toBe'` (default) requires
   * the same instance, `'toEqual'` lets a different instance of the same error
   * pass.
   */
  errorComparison?: 'toBe' | 'toEqual'
}

declare module 'vitest' {
  interface Matchers<R> {
    toBeLogNestError: () => R
    toMatchLogNestError: (
      expected: LogNestErrorExpectation,
      options?: LogNestErrorMatchOptions,
    ) => R
    toEqualLogNestError: (
      expected: LogNestErrorEqualExpectation,
      options?: LogNestErrorMatchOptions,
    ) => R
  }

  interface Assertion<R> {
    toThrowLogNestError: (
      expected?: LogNestErrorExpectation,
      options?: LogNestErrorMatchOptions,
    ) => R
    toThrowEqualLogNestError: (
      expected: LogNestErrorEqualExpectation,
      options?: LogNestErrorMatchOptions,
    ) => R
  }
}

type Testers = MatcherState['customTesters']
interface LogNestException extends HttpException {
  getResponse: () => ResponseErrorInternalDto
}
type LogNestErrorFields = ReturnType<typeof getLogNestErrorFields>

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

function isLogNestError(actual: unknown): actual is LogNestException {
  return (
    actual instanceof HttpException &&
    rawErrorSymbol in actual &&
    isLogNestErrorResponse(actual.getResponse())
  )
}

function getLogNestErrorFields(exception: LogNestException) {
  const response = exception.getResponse()
  return {
    status: exception.getStatus(),
    errorEnum: response.errorName,
    message: response.message,
    console: response[ErrorSymbols.console],
    error: Reflect.get(exception, rawErrorSymbol) as unknown,
    alert: response[ErrorSymbols.alert] === 1,
  }
}

const LOG_NEST_ERROR_DESCRIPTION =
  "an exception from log-nest's ErrorFactoryService"

function createNotLogNestErrorFailure(
  state: MatcherState,
  actual: unknown,
): SyncMatcherResult {
  return {
    pass: false,
    message: () =>
      `expected ${state.utils.printReceived(actual)} to be ${LOG_NEST_ERROR_DESCRIPTION}`,
  }
}

/**
 * Compares the `error` field. An expected `Error` must be the same instance
 * unless `errorComparison` is `'toEqual'`, because `equals` would accept a
 * different Error with the same name and message.
 */
function matchError(
  state: MatcherState,
  actualError: unknown,
  expectedError: unknown,
  {
    shouldCheckError,
    errorComparison,
  }: {
    /**
     * Whether the cause is compared at all. False only when
     * `toMatchLogNestError` gets an expectation without an `error` key, so any
     * cause, or none, matches. An explicit `error: undefined` is checked: it
     * asserts there is no cause.
     */
    shouldCheckError: boolean
    errorComparison: NonNullable<LogNestErrorMatchOptions['errorComparison']>
  },
  { testers, toEqualTesters }: { testers: Testers; toEqualTesters: Testers },
): { matches: boolean; isOnlyIdentityMismatch: boolean } {
  if (expectedError instanceof Error) {
    // the same instance needs no deep comparison, which can be costly for
    // errors that carry request or client objects
    if (actualError === expectedError) {
      return { matches: true, isOnlyIdentityMismatch: false }
    }
    const isStructurallyEqual = state.equals(
      actualError,
      expectedError,
      toEqualTesters,
    )
    if (errorComparison === 'toEqual') {
      return { matches: isStructurallyEqual, isOnlyIdentityMismatch: false }
    }
    return { matches: false, isOnlyIdentityMismatch: isStructurallyEqual }
  }
  return {
    matches:
      !shouldCheckError || state.equals(actualError, expectedError, testers),
    isOnlyIdentityMismatch: false,
  }
}

function matchLogNestError(
  state: MatcherState,
  actualFields: LogNestErrorFields,
  expected: LogNestErrorExpectation,
  subset: boolean,
  { errorComparison = 'toBe' }: LogNestErrorMatchOptions,
): SyncMatcherResult {
  const { iterableEquality, subsetEquality } = state.utils
  const toEqualTesters = [...state.customTesters, iterableEquality]
  const toMatchObjectTesters = [...toEqualTesters, subsetEquality]
  const testers = subset ? toMatchObjectTesters : toEqualTesters
  const expectedFields = subset
    ? expected
    : { ...expected, alert: expected.alert ?? false }
  const { error: expectedError, ...expectedRest } = expectedFields
  const { error: actualError, ...actualRest } = actualFields

  const error = matchError(
    state,
    actualError,
    expectedError,
    {
      shouldCheckError: !subset || 'error' in expected,
      errorComparison,
    },
    { testers, toEqualTesters },
  )
  const restMatches = state.equals(actualRest, expectedRest, testers)
  const pass = error.matches && restMatches

  const verb = subset ? 'match' : 'equal'
  if (state.isNot) {
    return {
      pass,
      message: () => `expected log-nest error not to ${verb} the expectation`,
    }
  }
  const instanceHint =
    "Pass the same instance, or { errorComparison: 'toEqual' } to compare by structure"
  if (error.isOnlyIdentityMismatch && restMatches) {
    return {
      pass,
      message: () =>
        `expected log-nest error to ${verb} the expectation, but \`error\` is a different Error instance with the same structure. ${instanceHint}`,
    }
  }
  return {
    pass,
    message: () =>
      error.isOnlyIdentityMismatch
        ? `expected log-nest error to ${verb} the expectation. Besides the differences below, \`error\` is a different Error instance with the same structure, which the diff can't show. ${instanceHint}`
        : `expected log-nest error to ${verb} the expectation`,
    actual: subset ? subsetForDiff(actualFields, expected) : actualFields,
    expected: expectedFields,
  }
}

function toBeLogNestError(
  this: MatcherState,
  actual: unknown,
): SyncMatcherResult {
  if (!isLogNestError(actual)) {
    return createNotLogNestErrorFailure(this, actual)
  }
  return {
    pass: true,
    message: () =>
      `expected ${this.utils.printReceived(actual)} not to be ${LOG_NEST_ERROR_DESCRIPTION}`,
  }
}

function toMatchLogNestError(
  this: MatcherState,
  actual: unknown,
  expected: LogNestErrorExpectation,
  options: LogNestErrorMatchOptions = {},
): SyncMatcherResult {
  if (!isLogNestError(actual)) {
    return createNotLogNestErrorFailure(this, actual)
  }
  return matchLogNestError(
    this,
    getLogNestErrorFields(actual),
    expected,
    true,
    options,
  )
}

function toEqualLogNestError(
  this: MatcherState,
  actual: unknown,
  expected: LogNestErrorEqualExpectation,
  options: LogNestErrorMatchOptions = {},
): SyncMatcherResult {
  if (!isLogNestError(actual)) {
    return createNotLogNestErrorFailure(this, actual)
  }
  return matchLogNestError(
    this,
    getLogNestErrorFields(actual),
    expected,
    false,
    options,
  )
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

function handleRejection(thenable: PromiseLike<unknown>): void {
  Promise.resolve(thenable).catch(() => undefined)
}

function checkThrown(
  state: MatcherState,
  matcherName: string,
  actual: unknown,
  check: (thrown: unknown) => SyncMatcherResult,
): SyncMatcherResult {
  if (state.promise === 'resolves') {
    throw new TypeError(
      `${matcherName} cannot be used with .resolves; use .rejects`,
    )
  }
  if (state.promise === 'rejects') {
    return check(actual)
  }
  if (typeof actual !== 'function') {
    if (isThenable(actual)) {
      handleRejection(actual)
    }
    throw new TypeError(
      `${matcherName} expects a function, or a promise with .rejects, but received ${state.utils.printReceived(actual)}`,
    )
  }

  let result: unknown
  try {
    result = (actual as () => unknown)()
  } catch (error) {
    return check(error)
  }
  if (isThenable(result)) {
    handleRejection(result)
    throw new TypeError(
      `${matcherName} got a function that returned a promise. For an async function use \`await expect(fn()).rejects.${matcherName}(...)\``,
    )
  }
  return {
    pass: false,
    message: () => `expected function to throw ${LOG_NEST_ERROR_DESCRIPTION}`,
  }
}

function toThrowLogNestError(
  this: MatcherState,
  actual: unknown,
  expected?: LogNestErrorExpectation,
  options: LogNestErrorMatchOptions = {},
): SyncMatcherResult {
  return checkThrown(this, 'toThrowLogNestError', actual, (thrown) =>
    expected === undefined
      ? toBeLogNestError.call(this, thrown)
      : toMatchLogNestError.call(this, thrown, expected, options),
  )
}

function toThrowEqualLogNestError(
  this: MatcherState,
  actual: unknown,
  expected: LogNestErrorEqualExpectation,
  options: LogNestErrorMatchOptions = {},
): SyncMatcherResult {
  return checkThrown(this, 'toThrowEqualLogNestError', actual, (thrown) =>
    toEqualLogNestError.call(this, thrown, expected, options),
  )
}

export const logNestMatchers = {
  toBeLogNestError,
  toMatchLogNestError,
  toEqualLogNestError,
  toThrowLogNestError,
  toThrowEqualLogNestError,
}
