import { HttpException } from '@nestjs/common'

/**
 * Escapes occurrences of the `"` and `\` characters in input string for logfmt compatibility
 * The function also replaces newline symbols with the "\n" (new line) string.
 *
 * Newline symbols create a new log entry in Grafana. By using this replacement approach, the
 * function ensures the entire log message remains on a single line, but information about line
 * breaks is preserved. Loki can correct this formatting with a single button click, without any
 * need for a query.
 */
export function escapeForLogfmt(value: string): string {
  return value
    .replaceAll(/["\\]/g, String.raw`\$&`)
    .replaceAll('\n', String.raw`\n`)
}

/** Formats a single logfmt value: objects are JSON-serialized, then strings are escaped. */
function formatValue(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return escapeForLogfmt(JSON.stringify(value))
  }
  if (typeof value === 'string') {
    return escapeForLogfmt(value)
  }
  // primitive (number, boolean, bigint, symbol, null, undefined)
  return String(value)
}

/**
 * Splits an object's own Symbol-keyed properties (with a description) from
 * its string-keyed ones: `responseLog` gets the former, keyed by each
 * symbol's description; `responseMessage` gets the latter, as-is.
 */
export function separateLogFromResponseObj(obj: object): {
  responseLog: Record<string, unknown>
  responseMessage: Record<string, unknown>
} {
  const responseLog: Record<string, unknown> = {}
  const responseMessage: Record<string, unknown> = {}
  const record = obj as Record<string | symbol, unknown>

  Object.getOwnPropertyNames(obj).forEach((keyStr) => {
    // eslint-disable-next-line security/detect-object-injection
    responseMessage[keyStr] = record[keyStr]
  })

  Object.getOwnPropertySymbols(obj).forEach((symbol) => {
    if (symbol.description) {
      // eslint-disable-next-line security/detect-object-injection
      responseLog[symbol.description] = record[symbol]
    }
  })

  return { responseLog, responseMessage }
}

/**
 * Takes and object and creates a flat one-line string representation.
 *
 * Example output
 *  "key1"="value1" "key2"="value2" "key3"="{ objectKey1: \"string with newline at the end\n\"}"
 *
 * If an object is present as a value, it will be converted to json string.
 * Return string does not contain any new line symbols - they will be replaced by '\n'.
 *
 * If a key is represented as a symbol, it will be included in the final output.
 */
export function objToLogfmt(obj: object): string {
  const { responseLog, responseMessage } = separateLogFromResponseObj(obj)
  const objAll = { ...responseLog, ...responseMessage }

  return Object.entries(objAll)
    .flatMap(([key, value]): string[] => {
      // the `console` field is flattened so its sub-fields become top-level logfmt pairs
      if (key === 'console' && typeof value === 'object' && value !== null) {
        return Object.entries(value).map(
          ([subKey, subValue]) => `${subKey}="${formatValue(subValue)}"`,
        )
      }
      return [`${key}="${formatValue(value)}"`]
    })
    .join(' ')
}

function httpExceptionToObj(
  error: HttpException,
  methodName?: string | symbol,
): object {
  const response = error.getResponse()
  try {
    const { responseLog, responseMessage } = separateLogFromResponseObj(
      typeof response === 'string'
        ? (JSON.parse(response) as object)
        : response,
    )
    return {
      errorType: error.name,
      ...responseMessage,
      ...responseLog,
      method: methodName,
      stack: error.stack,
    }
  } catch (parseError) {
    // eslint-disable-next-line no-console
    console.warn(
      `message="Failed to parse HttpException response while formatting logfmt" ${errorToLogfmt(parseError, methodName)}`,
    )
    return {
      errorType: error.name,
      message: error.message,
      method: methodName,
      stack: error.stack,
    }
  }
}

function genericErrorToObj(error: Error, methodName?: string | symbol): object {
  return {
    errorType: error.name,
    message: error.message,
    method: methodName,
    stack: error.stack,
  }
}

export function errorToLogfmt(
  error: unknown,
  methodName?: string | symbol,
): string {
  if (error instanceof HttpException) {
    return objToLogfmt(httpExceptionToObj(error, methodName))
  }
  if (error instanceof Error) {
    return objToLogfmt(genericErrorToObj(error, methodName))
  }
  return objToLogfmt({
    errorType: `UnexpectedErrorType: ${typeof error}`,
    message: 'Unexpected type was thrown as error. This should not happen',
    method: methodName,
    alert: 1,
  })
}

export function isLogfmt(input: string): boolean {
  // value content is "any non-quote/backslash/newline char, or a backslash-escaped char";
  // the two alternatives are mutually exclusive, so there is no catastrophic backtracking. The
  // rule still flags the nested quantifier (star height) that repeated quoted pairs inherently need.
  // eslint-disable-next-line security/detect-unsafe-regex
  const regex = /((^| )\w+="(?:[^\n"\\]|\\.)*")+$/
  return regex.test(input)
}

export function toLogfmt(input: unknown): string {
  if (!input) {
    return ''
  }
  if (input instanceof Error) {
    return errorToLogfmt(input)
  }
  if (typeof input === 'object') {
    return objToLogfmt(input)
  }
  if (typeof input === 'string') {
    return isLogfmt(input) ? input : `message="${escapeForLogfmt(input)}"`
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return `message="${escapeForLogfmt(input.toString())}"`
}
