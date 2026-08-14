import { STATUS_CODES } from 'node:http'

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common'
import { AxiosError } from 'axios'

import { NEST_LOGGING_OPTIONS, type NestLoggingOptions } from '../options'
import { ErrorEnum, ErrorResponseEnum } from './base-errors.enum'
import { ErrorSymbols } from './error-symbols'
import { ResponseErrorInternalDto } from './response-error.dto'
import { FromAxiosErrorOptions } from './status-override'

/**
 * Arguments for the per-status factory methods of {@link ErrorFactory}.
 *
 * @property errorEnum stored as `errorName` on the produced exception. Drives
 *        alerting via the injected `alertReporting` list.
 * @property message human-readable text on the exception's `message` field.
 * @property console extra context attached to the log entry only and stripped
 *        from the client response.
 * @property error the underlying cause, recorded for logging (and its stack is
 *        chained onto the produced exception).
 */
export interface LoggingExceptionOptions<TErrorEnum extends string = string> {
  errorEnum: TErrorEnum
  message: string
  console?: string | Record<string, unknown>
  error?: unknown
}

// Provided dynamically via NestLoggingModule.forRoot(), which the static plugin can't detect.
@Injectable()
// eslint-disable-next-line @darraghor/nestjs-typed/injectable-should-be-provided
export class ErrorFactory<TErrorEnum extends string = string> {
  private readonly alertReporting: readonly string[]

  constructor(
    @Optional()
    @Inject(NEST_LOGGING_OPTIONS)
    options?: NestLoggingOptions,
  ) {
    // Optional so the error factory can be constructed in tests / `new ErrorFactory()`
    // without NestLoggingModule.forRoot(). Without options no error alerts (empty list).
    this.alertReporting = options?.alertReporting ?? []
  }

  NotAcceptableException(
    options: LoggingExceptionOptions<TErrorEnum>,
  ): HttpException {
    return this.LoggingHttpException(
      HttpStatus.NOT_ACCEPTABLE,
      'Resource was not accepted.',
      options,
    )
  }

  GoneException(options: LoggingExceptionOptions<TErrorEnum>): HttpException {
    return this.LoggingHttpException(
      HttpStatus.GONE,
      'Resource is gone.',
      options,
    )
  }

  PayloadTooLargeException(
    options: LoggingExceptionOptions<TErrorEnum>,
  ): HttpException {
    return this.LoggingHttpException(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'Payload too large.',
      options,
    )
  }

  InternalServerErrorException(
    options: LoggingExceptionOptions<TErrorEnum>,
  ): HttpException {
    return this.LoggingHttpException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Internal server error',
      options,
    )
  }

  BadGatewayException(
    options: LoggingExceptionOptions<TErrorEnum>,
  ): HttpException {
    return this.LoggingHttpException(
      HttpStatus.BAD_GATEWAY,
      'Bad gateway',
      options,
    )
  }

  ServiceUnavailableException(
    options: LoggingExceptionOptions<TErrorEnum>,
  ): HttpException {
    return this.LoggingHttpException(
      HttpStatus.SERVICE_UNAVAILABLE,
      'Service unavailable',
      options,
    )
  }

  ForbiddenException(
    options: LoggingExceptionOptions<TErrorEnum>,
  ): HttpException {
    return this.LoggingHttpException(HttpStatus.FORBIDDEN, 'Forbidden', options)
  }

  UnprocessableEntityException(
    options: LoggingExceptionOptions<TErrorEnum>,
  ): HttpException {
    return this.LoggingHttpException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Unprocessable entity',
      options,
    )
  }

  NotFoundException(
    options: LoggingExceptionOptions<TErrorEnum>,
  ): HttpException {
    return this.LoggingHttpException(HttpStatus.NOT_FOUND, 'Not found', options)
  }

  BadRequestException(
    options: LoggingExceptionOptions<TErrorEnum>,
  ): HttpException {
    return this.LoggingHttpException(
      HttpStatus.BAD_REQUEST,
      'Bad Request',
      options,
    )
  }

  UnauthorizedException(
    options: LoggingExceptionOptions<TErrorEnum>,
  ): HttpException {
    return this.LoggingHttpException(
      HttpStatus.UNAUTHORIZED,
      'Unauthorized',
      options,
    )
  }

  /**
   * Maps an `AxiosError` to an `HttpException`, picking the variant
   * from the downstream response:
   * - status included in opts.statusOverrides -> custom status, errorEnum, and
   *     message from the override entry
   * - `503` with `Retry-After` -> {@link ServiceUnavailableException}
   * - `401` / `403` -> {@link BadGatewayException} with
   *     `ErrorEnum.BAD_GATEWAY_AUTH_ERROR`
   * - anything else -> {@link BadGatewayException} with
   *     `ErrorEnum.BAD_GATEWAY_ERROR`
   *
   * `ErrorEnum.BAD_GATEWAY_AUTH_ERROR` must be listed in the injected
   * `alertReporting` so misconfigured credentials/secrets alert instead of
   * failing silently. `ErrorEnum.SERVICE_UNAVAILABLE_ERROR` and
   * `ErrorEnum.BAD_GATEWAY_ERROR` should not be alerted.
   *
   * @param error the processed AxiosError
   * @param options for overriding message and errorEnum. Adds an option to
   * write a console message. `options: overrides` allows for custom
   * response based on `AxiosError.response.status` (for more see
   * {@link FromAxiosErrorOptions.statusOverrides})
   */
  fromAxiosError(
    error: AxiosError,
    options: FromAxiosErrorOptions<TErrorEnum>,
  ): HttpException {
    const { message, console, errorEnumOverwrite, statusOverrides } = options
    const status = error.response?.status
    // keyed by numeric HTTP status from the downstream response, not a user-supplied property name
    const override =
      // eslint-disable-next-line security/detect-object-injection
      status === undefined ? undefined : statusOverrides?.[status]

    if (override !== undefined) {
      const overrideStatus = override.status
      // numeric HTTP status lookup into node's STATUS_CODES reason-phrase table
      // eslint-disable-next-line security/detect-object-injection
      const reason = STATUS_CODES[overrideStatus] ?? message ?? ''
      return this.LoggingHttpException(overrideStatus, reason, {
        errorEnum: override.errorEnum,
        message: override.message,
        console,
        error,
      })
    }

    if (
      status === HttpStatus.SERVICE_UNAVAILABLE &&
      error.response?.headers['retry-after']
    ) {
      return this.ServiceUnavailableException({
        errorEnum:
          errorEnumOverwrite ??
          (ErrorEnum.SERVICE_UNAVAILABLE_ERROR as TErrorEnum),
        message: message ?? ErrorResponseEnum.SERVICE_UNAVAILABLE_ERROR,
        console,
        error,
      })
    }

    // 401/403 from the downstream means our credentials are wrong/expired — the
    // request is never going to succeed without direct intervention, so alert
    // by default.
    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      return this.BadGatewayException({
        errorEnum:
          errorEnumOverwrite ??
          (ErrorEnum.BAD_GATEWAY_AUTH_ERROR as TErrorEnum),
        message: message ?? ErrorResponseEnum.BAD_GATEWAY_AUTH_ERROR,
        console,
        error,
      })
    }

    return this.BadGatewayException({
      errorEnum:
        errorEnumOverwrite ?? (ErrorEnum.BAD_GATEWAY_ERROR as TErrorEnum),
      message: message ?? ErrorResponseEnum.BAD_GATEWAY_ERROR,
      console,
      error,
    })
  }

  private LoggingHttpException(
    statusCode: number,
    status: string,
    {
      errorEnum,
      message,
      console,
      error: errorCause,
    }: LoggingExceptionOptions<TErrorEnum>,
  ): HttpException {
    const response: ResponseErrorInternalDto<TErrorEnum> =
      errorCause instanceof Error
        ? {
            statusCode,
            status,
            errorName: errorEnum,
            [ErrorSymbols.alert]: 0,
            message,
            [ErrorSymbols.errorCause]: errorCause.name,
            [ErrorSymbols.causedByMessage]: errorCause.message,
            [ErrorSymbols.causedByConsole]:
              errorCause instanceof HttpException
                ? (errorCause.getResponse() as ResponseErrorInternalDto)[
                    ErrorSymbols.console
                  ]
                : undefined,
            [ErrorSymbols.console]: console,
          }
        : {
            statusCode,
            status,
            errorName: errorEnum,
            [ErrorSymbols.alert]: 0,
            message,
            [ErrorSymbols.errorCause]: errorCause
              ? typeof errorCause
              : undefined,
            [ErrorSymbols.causedByMessage]: errorCause
              ? JSON.stringify(errorCause)
              : undefined,
            [ErrorSymbols.console]: console,
          }

    if (this.alertReporting.includes(errorEnum)) {
      response[ErrorSymbols.alert] = 1
    }
    const exception = new HttpException(response, statusCode)

    if (errorCause && errorCause instanceof Error && errorCause.stack) {
      exception.stack = [
        exception.stack,
        'Was directly caused by:\n',
        errorCause.stack,
      ].join('\n')
    }

    return exception
  }
}
