const alertSymbol: unique symbol = Symbol('alert')
const consoleSymbol: unique symbol = Symbol('console')
const errorCauseSymbol: unique symbol = Symbol('errorCause')
const causedByMessageSymbol: unique symbol = Symbol('causedByMessage')
const causedByConsoleSymbol: unique symbol = Symbol('causedByConsole')
const methodNameSymbol: unique symbol = Symbol('methodName')

/**
 * Symbol keys for the internal log metadata attached to error responses (or,
 * like `methodName`, to the thrown error itself). Keyed by `Symbol` so they
 * survive in-process but never serialize to the client JSON.
 */
export const ErrorSymbols = {
  alert: alertSymbol,
  console: consoleSymbol,
  errorCause: errorCauseSymbol,
  causedByMessage: causedByMessageSymbol,
  causedByConsole: causedByConsoleSymbol,
  methodName: methodNameSymbol,
} as const
