import { ErrorSymbols } from './error-symbols'

/**
 * Internal shape of the body carried by every {@link HttpException} the
 * package produces. The `[ErrorSymbols.*]` fields are keyed by `Symbol`, so
 * they survive in-process but are stripped from the JSON sent to the client
 * (see `separateLogFromResponseObj` / `symbolKeysToStrings`).
 *
 * Generic over the app's error-enum union: pass `CustomErrorEnums` to get
 * full type-safety on `errorName`, or leave the default `string`.
 */
export interface ResponseErrorInternalDto<TErrorEnum extends string = string> {
  statusCode: number

  status: string

  message: string

  errorName: TErrorEnum

  [ErrorSymbols.alert]?: number

  [ErrorSymbols.console]?: string | Record<string, unknown>

  [ErrorSymbols.errorCause]?: string

  [ErrorSymbols.causedByMessage]?: string

  [ErrorSymbols.causedByConsole]?: string | Record<string, unknown>
}
