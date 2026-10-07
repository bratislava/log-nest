import { HttpException } from '@nestjs/common'

import { ErrorSymbols } from './error-symbols'
import { ResponseErrorInternalDto } from './response-error.dto'

export type ErrorCauseFields = Pick<
  ResponseErrorInternalDto,
  | typeof ErrorSymbols.errorCause
  | typeof ErrorSymbols.causedByMessage
  | typeof ErrorSymbols.causedByConsole
>

export function errorCauseFields(errorCause: unknown): ErrorCauseFields {
  const fields: ErrorCauseFields = {}

  if (errorCause instanceof Error) {
    fields[ErrorSymbols.errorCause] = errorCause.name
    fields[ErrorSymbols.causedByMessage] = errorCause.message
    const causedByConsole =
      errorCause instanceof HttpException
        ? (errorCause.getResponse() as ResponseErrorInternalDto)[
            ErrorSymbols.console
          ]
        : undefined
    if (causedByConsole !== undefined) {
      fields[ErrorSymbols.causedByConsole] = causedByConsole
    }
  } else if (errorCause) {
    fields[ErrorSymbols.errorCause] = typeof errorCause
    // JSON.stringify returns undefined for e.g. functions and symbols
    const causedByMessage = JSON.stringify(errorCause) as string | undefined
    if (causedByMessage !== undefined) {
      fields[ErrorSymbols.causedByMessage] = causedByMessage
    }
  }

  return fields
}
