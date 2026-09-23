import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'

import { LineLoggerSubservice } from '../logging/line-logger.subservice'
import { AllowListService } from '../sanitization/allow-list.service'
import { RedactionService } from '../sanitization/redaction.service'
import { AllowShape } from '../sanitization/types/allow-list.types'
import { SanitizeMetadata } from '../sanitization/types/redaction.types'

const SERVER_ERROR_FROM = 500
const CLIENT_ERROR_FROM = 400

type ExitData = string | object | Buffer | unknown[] | undefined

/** Request-derived fields every `response.*` override needs for its log line. */
interface RequestLogContext {
  method: string
  originalUrl: string
  startAt: [number, number]
  userAgent: string
  ip: string
  userId: string
}

@Injectable()
export class AppLoggerMiddleware implements NestMiddleware {
  constructor(
    private readonly redactionService: RedactionService,
    private readonly allowListService: AllowListService,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const { method, originalUrl, body, ip, userAgent, userId } =
      this.extractRequestData(request)
    const context: RequestLogContext = {
      method,
      originalUrl,
      startAt: process.hrtime(),
      userAgent,
      ip,
      userId,
    }
    response.locals.middlewareUsed = 'true'

    this.installSendOverride(response, context, body)
    this.installRedirectOverride(response, context, body)

    next()
  }

  private installSendOverride(
    response: Response,
    context: RequestLogContext,
    body: unknown,
  ): void {
    const { send } = response
    response.send = (exitData?: ExitData) => {
      response.locals.middlewareUsed = undefined

      // `SanitizeMetadataInterceptor` wrote this before the handler ran, if
      // `@AllowList`/`@Redact` applied to it - independent of `exitData`,
      // which by now might be the stringified body, not the original value.
      const loggingOptions = response.locals.sanitizeMetadata as
        SanitizeMetadata | undefined
      response.locals.sanitizeMetadata = undefined
      const redactorNames = loggingOptions?.redactorNames ?? []
      const allowShape = loggingOptions?.allowShape

      const responseValue = this.parseExitData(response, exitData)
      const redactedResponseValue = this.sanitize(
        redactorNames,
        allowShape,
        responseValue,
      )

      const stringifiedResponseValue: unknown = JSON.stringify(
        redactedResponseValue,
      )
      const responseLogData =
        typeof redactedResponseValue === 'string'
          ? redactedResponseValue
          : ((stringifiedResponseValue as string | undefined) ?? '')

      // `error.filter.ts` parks log-only fields (errorType, stack, alert,
      // console, ...) here, since they never belong in the client-facing body.
      const errorLogData = response.locals.errorLogData as
        Record<string, unknown> | undefined
      response.locals.errorLogData = undefined

      this.logExit(
        response,
        context,
        this.sanitizeToJson(redactorNames, allowShape, body),
        responseLogData,
        errorLogData,
      )

      response.send = send
      return response.send(exitData)
    }
  }

  /**
   * `res.redirect()` calls `res.end()` directly, bypassing `send` above.
   * Delegates first, then reads status/Location back off `response` (works
   * for both call arities).
   */
  private installRedirectOverride(
    response: Response,
    context: RequestLogContext,
    body: unknown,
  ): void {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called via .apply(response, ...) below, so `this` is bound explicitly
    const { redirect } = response
    response.redirect = (...args: unknown[]) => {
      response.redirect = redirect
      ;(redirect as (...args: unknown[]) => void).apply(response, args)
      response.locals.middlewareUsed = undefined

      const loggingOptions = response.locals.sanitizeMetadata as
        SanitizeMetadata | undefined
      response.locals.sanitizeMetadata = undefined
      const redactorNames = loggingOptions?.redactorNames ?? []
      const allowShape = loggingOptions?.allowShape

      const url = response.getHeader('Location')?.toString() ?? ''

      this.logExit(
        response,
        context,
        this.sanitizeToJson(redactorNames, allowShape, body),
        // `url` is a bare string, not a keyed object - `allowShape` only
        // ever describes structure to recurse into, so it can't sensibly
        // apply here; only content-based `@Redact` can act on it.
        this.sanitize(redactorNames, true, url) as string,
      )

      return response
    }
  }

  private extractRequestData(request: Request): {
    method: string
    ip: string
    userAgent: string
    originalUrl: string
    body: unknown
    userId: string
  } {
    const { method, originalUrl } = request
    const body: unknown = request.body
    const ip = request.ip ?? '<NO IP>'
    const userAgent = request.get('user-agent') || ''

    const userId = this.decodeUserId(request.headers.authorization)

    return { method, originalUrl, body, ip, userAgent, userId }
  }

  /**
   * Best-effort userId for the log line only: decode the JWT payload WITHOUT
   * verifying its signature. Never use this for authorization.
   */
  decodeUserId(authorization: string | undefined): string {
    if (!authorization) {
      return ''
    }
    try {
      const payload = JSON.parse(
        Buffer.from(authorization.split('.')[1], 'base64').toString(),
      ) as { sub?: string }
      return payload.sub ?? '<NO USER ID>'
    } catch {
      return ''
    }x
  }

  private sanitize(
    redactorNames: readonly string[],
    allowShape: AllowShape | undefined,
    value: unknown,
  ): unknown {
    const filtered = this.allowListService.filter(allowShape, value)
    return this.redactionService.redact(redactorNames, filtered)
  }

  private sanitizeToJson(
    redactorNames: readonly string[],
    allowShape: AllowShape | undefined,
    value: unknown,
  ): string {
    return JSON.stringify(this.sanitize(redactorNames, allowShape, value))
  }

  private buildBaseLogObj(
    context: RequestLogContext,
  ): Record<string, string | number> {
    const diff = process.hrtime(context.startAt)
    const responseTime = diff[0] * 1e3 + diff[1] * 1e-6
    return {
      test: 'true',
      method: context.method,
      originalUrl: context.originalUrl,
      responseTime,
      userAgent: context.userAgent,
      ip: context.ip,
      userId: context.userId,
    }
  }

  /** Assembles the full log line for any response exit path and emits it. */
  private logExit(
    response: Response,
    context: RequestLogContext,
    requestBodyLog: string,
    responseDataLog: string,
    extra?: Record<string, unknown>,
  ): void {
    const logger = new LineLoggerSubservice(response.statusMessage)
    const logObj: Record<string, string | number> = {
      ...this.buildBaseLogObj(context),
      statusCode: response.statusCode,
      'request-body': requestBodyLog,
      'response-data': responseDataLog,
      ...extra,
    }
    this.emitAtSeverity(logger, response.statusCode, logObj)
  }

  private emitAtSeverity(
    logger: LineLoggerSubservice,
    statusCode: number,
    logObj: Record<string, string | number>,
  ): void {
    if (statusCode >= SERVER_ERROR_FROM || logObj.alert === 1) {
      logger.error(logObj)
    } else if (statusCode >= CLIENT_ERROR_FROM) {
      logger.warn(logObj)
    } else {
      logger.log(logObj)
    }
  }

  /**
   * `exitData` as the value to log: JSON-parsed back into an object when
   * it's a JSON string (so `sanitize()` can filter/redact it structurally),
   * otherwise passed through as-is. Never touches what's actually sent to
   * the client - `exitData` itself goes to `response.send()` unchanged.
   */
  private parseExitData(response: Response, exitData: ExitData): unknown {
    if (
      typeof exitData !== 'string' ||
      !response
        .getHeader('content-type')
        ?.toString()
        .includes('application/json')
    ) {
      return exitData
    }

    try {
      return JSON.parse(exitData) as unknown
    } catch {
      // Not actually JSON despite the content-type header - log as-is.
      return exitData
    }
  }
}
