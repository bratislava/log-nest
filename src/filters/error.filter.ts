import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { Response } from 'express'

import { LineLoggerSubservice } from '../logging/line-logger.subservice'
import { separateLogFromResponseObj } from '../logging/logfmt'

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
 * `ErrorSymbols.*` keys along with `errorType`/ `stack` are split off here and
 * handed to `res.locals`, for `AppLoggerMiddleware` to fold into the log line.
 *
 * Logs directly instead when `AppLoggerMiddleware` never ran (e.g. an unmatched
 * route), since then nothing else would.
 */
function respondOrLog(
  host: ArgumentsHost,
  exception: unknown,
  filterName: string,
  statusCode: number,
  rawBody: object,
  errorType: string,
  stack: string | undefined,
): void {
  const response = host.switchToHttp().getResponse<Response>()
  response.status(statusCode)

  const { responseLog, responseMessage } = separateLogFromResponseObj(rawBody)

  if (response.locals.middlewareUsed) {
    // `response.locals.sanitizeMetadata` was already written by
    // SanitizeLogMetadataInterceptor before the handler ran, and survives a
    // thrown error the same as a normal return - nothing to forward here.
    response.locals.errorLogData = { ...responseLog, errorType, stack }
    response.json(responseMessage)
    return
  }

  new LineLoggerSubservice(filterName).error(exception, responseLog)
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
      { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message },
      name,
      stack,
    )
  }
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    rethrowIfNotHttp(host, exception, HttpExceptionFilter.name)

    const status = exception.getStatus()
    const exceptionResponse = exception.getResponse()
    const rawBody =
      typeof exceptionResponse === 'object'
        ? exceptionResponse
        : { response: exceptionResponse }

    respondOrLog(
      host,
      exception,
      HttpExceptionFilter.name,
      status,
      rawBody,
      'HttpException',
      exception.stack,
    )
  }
}

/**
 * Catches anything `ErrorFilter`/`HttpExceptionFilter` don't: a value thrown
 * that isn't an `Error` or `HttpException` at all (a string, a plain object,
 * ...). Without this, such a throw still resolves the request safely (Nest's
 * own default handler takes over), but produces a log line with no
 * `errorType`/diagnostic info whatsoever - nothing to debug from.
 *
 * `@Catch()` with no arguments matches every exception, so this MUST be
 * registered FIRST in `useGlobalFilters(...)`: Nest internally reverses
 * global filters before matching (`RouterExceptionFilters.create()` calls
 * `filters.reverse()`), so the filter registered first is actually checked
 * last - i.e. only used as a fallback once every other filter's type has
 * been tried and failed to match.
 */
@Catch()
export class UnknownExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    rethrowIfNotHttp(host, exception, UnknownExceptionFilter.name)

    const errorType =
      typeof exception === 'object' && exception !== null
        ? // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          (exception.constructor?.name ?? 'Object: null prototype')
        : `UnexpectedErrorType: ${typeof exception}`

    respondOrLog(
      host,
      exception,
      UnknownExceptionFilter.name,
      HttpStatus.INTERNAL_SERVER_ERROR,
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      },
      errorType,
      undefined,
    )
  }
}
