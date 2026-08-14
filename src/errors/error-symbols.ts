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

export const errorTypeKeys: Record<string, string> = {
  alert: `$Symbol-alert`,
  console: `$Symbol-console`,
  errorType: `$Symbol-errorType`,
  stack: `$Symbol-stack`,
  errorCause: `$Symbol-errorCause`,
  causedByMessage: `$Symbol-causedByMessage`,
  causedByConsole: `$Symbol-causedByConsole`,
}

export const errorTypeStrings = Object.values(errorTypeKeys)
