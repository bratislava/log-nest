const alertSymbol: unique symbol = Symbol('alert')
const consoleSymbol: unique symbol = Symbol('console')
const errorCauseSymbol: unique symbol = Symbol('errorCause')
const causedByMessageSymbol: unique symbol = Symbol('causedByMessage')
const causedByConsoleSymbol: unique symbol = Symbol('causedByConsole')

/**
 * Symbol keys for the internal log metadata attached to error responses. Keyed
 * by `Symbol` so they survive in-process but never serialize to the client JSON.
 */
export const ErrorSymbols = {
  alert: alertSymbol,
  console: consoleSymbol,
  errorCause: errorCauseSymbol,
  causedByMessage: causedByMessageSymbol,
  causedByConsole: causedByConsoleSymbol,
} as const

/**
 * Key on the HttpException itself (not its response) for the `error` passed to
 * ErrorFactoryService, unprocessed. Non-enumerable and never logged; read by
 * the matchers in `@bratislava/log-nest/testing`.
 */
export const rawErrorSymbol: unique symbol = Symbol('rawError')
