import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { Response } from 'express'

import { errorTypeKeys } from '../errors/error-symbols'
import { LineLoggerSubservice } from '../logging/line-logger.subservice'
import {
  separateLogFromResponseObj,
  symbolKeysToStrings,
} from '../logging/logfmt'
import { forwardSanitizeMetadataToLocals } from '../sanitization/sanitize-metadata.util'

function rethrowIfNotHttp(
  host: ArgumentsHost,
  exception: unknown,
  filterName: string,
): void {
  if (host.getType() !== 'http') {
    const logger = new LineLoggerSubservice(`${filterName} non HTTP`)
    logger.error(exception)
    throw exception
  }
}

/**
 * Shared response/log handling for the exception filters.
 *
 * Always sends a response.
 *
 * Logs directly and strips the log-only fields itself when `AppLoggerMiddleware`
 * never ran (e.g. an unmatched route), since then nothing else would.
 */
function respondOrLog(
  host: ArgumentsHost,
  exception: unknown,
  filterName: string,
  statusCode: number,
  buildBody: () => Record<string, unknown>,
): void {
  const response = host.switchToHttp().getResponse<Response>()
  response.status(statusCode)

  if (response.locals.middlewareUsed) {
    forwardSanitizeMetadataToLocals(response.locals, exception)
    response.json(buildBody())
    return
  }

  new LineLoggerSubservice(filterName).error(exception)
  const { responseMessage } = separateLogFromResponseObj(buildBody())
  response.json(responseMessage)
}

@Catch(Error)
export class ErrorFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost): void {
    rethrowIfNotHttp(host, exception, ErrorFilter.name)

    const { name, stack, message } = exception
    respondOrLog(
      host,
      exception,
      ErrorFilter.name,
      HttpStatus.INTERNAL_SERVER_ERROR,
      () => ({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        [errorTypeKeys.errorType]: name,
        message,
        [errorTypeKeys.stack]: stack,
      }),
    )
  }
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    rethrowIfNotHttp(host, exception, HttpExceptionFilter.name)

    const status = exception.getStatus()
    const exceptionResponse = exception.getResponse()

    respondOrLog(host, exception, HttpExceptionFilter.name, status, () =>
      typeof exceptionResponse === 'object'
        ? {
            ...symbolKeysToStrings(exceptionResponse),
            [errorTypeKeys.errorType]: 'HttpException',
            [errorTypeKeys.stack]: exception.stack,
          }
        : {
            response: exceptionResponse,
            [errorTypeKeys.errorType]: 'HttpException',
            [errorTypeKeys.stack]: exception.stack,
          },
    )
  }
}
