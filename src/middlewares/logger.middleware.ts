import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'

import { LineLoggerSubservice } from '../logging/line-logger.subservice'
import { NEST_LOGGING_OPTIONS } from '../options'
import { AllowListService } from '../sanitization/allow-list.service'
import { RedactionService } from '../sanitization/redaction.service'
import { forwardSanitizeMetadataToLocals } from '../sanitization/sanitize-metadata.util'
import { AllowShape } from '../sanitization/types/allow-list.types'
import { SanitizeMetadata } from '../sanitization/types/redaction.types'

const SERVER_ERROR_FROM = 500
const CLIENT_ERROR_FROM = 400

type ExitData = string | object | Buffer | unknown[]

@Injectable()
export class AppLoggerMiddleware implements NestMiddleware {
  constructor(
    private readonly redactionService: RedactionService,
    private readonly allowListService: AllowListService,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const { method, originalUrl, body, ip, userAgent, userId } =
      this.extractRequestData(request)
    const startAt = process.hrtime()
    response.locals.middlewareUsed = 'true'

    // `res.json` stringifies away the Symbol-keyed sanitize metadata before
    // `res.send` (below) ever sees it, so lift it onto `res.locals` first.
    const { json } = response
    response.json = (jsonBody: ExitData) => {
      forwardSanitizeMetadataToLocals(response.locals, jsonBody)
      response.json = json
      return response.json(jsonBody)
    }

    const { send } = response
    response.send = (exitData: ExitData) => {
      response.locals.middlewareUsed = undefined

      const loggingOptions = this.readAndClearSanitizeMetadata(
        response,
        exitData,
      )
      const redactorNames = loggingOptions?.redactorNames ?? []
      const allowShape = loggingOptions?.allowShape

      const { responseValue, returnExitData } = this.parseExitData(
        response,
        exitData,
        loggingOptions,
      )
      const redactedResponseValue = this.sanitize(
        redactorNames,
        allowShape,
        responseValue,
      )
      const responseLogData =
        typeof redactedResponseValue === 'string'
          ? redactedResponseValue
          : JSON.stringify(redactedResponseValue)

      // `error.filter.ts` parks log-only fields (errorType, stack, alert,
      // console, ...) here, since they never belong in the client-facing body.
      const errorLogData = response.locals.errorLogData as
        Record<string, unknown> | undefined
      response.locals.errorLogData = undefined

      const logger = new LineLoggerSubservice(response.statusMessage)

      const diff = process.hrtime(startAt)
      const responseTime = diff[0] * 1e3 + diff[1] * 1e-6
      const logObj: Record<string, string | number> = {
        test: 'true',
        method,
        originalUrl,
        statusCode: response.statusCode,
        responseTime,
        userAgent,
        ip,
        userId,
        'request-body': JSON.stringify(
          this.sanitize(redactorNames, allowShape, body),
        ),
        'response-data': responseLogData,
        ...errorLogData,
      }
      if (response.statusCode >= SERVER_ERROR_FROM || logObj.alert === 1) {
        logger.error(logObj)
      } else if (response.statusCode >= CLIENT_ERROR_FROM) {
        logger.warn(logObj)
      } else {
        logger.log(logObj)
      }

      // The handler returned a primitive; `@AllowList`/`@Redact` boxed it so Nest
      // sent it through `res.json`, which set `Content-Type: application/json`.
      // Now that it's unboxed, drop that header so `res.send` re-infers the type
      // for the bare value: what Nest would have sent without the decorator.
      const returnExitValue: unknown = returnExitData
      if (
        loggingOptions?.valueIsNotObject &&
        (typeof returnExitValue !== 'object' || returnExitValue === null)
      ) {
        response.removeHeader('content-type')
      }

      response.send = send
      return response.send(returnExitData)
    }

    next()
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

    // Best-effort userId for the log line only: decode the JWT payload WITHOUT
    // verifying its signature. Never use this for authorization.
    let userId = ''
    try {
      if (request.headers.authorization) {
        const token = request.headers.authorization.split('.')[1]
        const tokenData = JSON.parse(
          Buffer.from(token, 'base64').toString(),
        ) as { sub?: string }
        userId = tokenData.sub ?? '<NO USER ID>'
      }
    } catch {
      /* empty */
    }

    return { method, originalUrl, body, ip, userAgent, userId }
  }

  private sanitize(
    redactorNames: readonly string[],
    allowShape: AllowShape | undefined,
    value: unknown,
  ): unknown {
    const filtered = this.allowListService.filter(allowShape, value)
    return this.redactionService.redact(redactorNames, filtered)
  }

  /**
   * Tries `exitData`'s own symbol first, falling back to `res.locals`
   * (single-use, always cleared after).
   */
  private readAndClearSanitizeMetadata(
    response: Response,
    exitData: ExitData,
  ): SanitizeMetadata | undefined {
    const meta =
      this.extractLoggingOptions(exitData) ??
      (response.locals.sanitizeMetadata as SanitizeMetadata | undefined)
    response.locals.sanitizeMetadata = undefined
    return meta
  }

  /**
   * Reads `@Redact`'s `{ valueIsNotObject?, redactors? }` metadata directly
   * off `exitData` by its actual Symbol key. `@Redact` attaches this to any
   * object-typed return value (including arrays and Buffers, since those are
   * `typeof 'object'` too), not only the plain-object case `parseExitData`
   * mainly deals with, so this must run before any branch decides the
   * metadata isn't there. A string `exitData` can't carry it: symbol-keyed
   * properties can't be attached to a primitive string value.
   */
  private extractLoggingOptions(
    exitData: ExitData,
  ): SanitizeMetadata | undefined {
    if (typeof exitData !== 'object' || (exitData as unknown) === null) {
      return undefined
    }
    return Reflect.get(exitData, NEST_LOGGING_OPTIONS) as
      SanitizeMetadata | undefined
  }

  /**
   * Picks apart `exitData` into the value to actually log (`responseValue`,
   * still unsanitized - the caller runs it through `sanitize()`) and the
   * value to send back to the client (`returnExitData`, never sanitized).
   */
  private parseExitData(
    response: Response,
    exitData: ExitData,
    loggingOptions: SanitizeMetadata | undefined,
  ): {
    returnExitData: typeof exitData
    responseValue: unknown
  } {
    if (
      !response
        .getHeader('content-type')
        ?.toString()
        .includes('application/json')
    ) {
      return { responseValue: exitData, returnExitData: exitData }
    }

    let data: unknown = exitData

    // Parse string-type exitData if it is JSON
    if (typeof exitData === 'string') {
      try {
        data = JSON.parse(exitData) as unknown
      } catch {
        // If parsing fails, assume it's a plain string
        return { responseValue: exitData, returnExitData: exitData }
      }
    }

    const responseMessage = data as Record<string, unknown>

    // `@Redact`/`@AllowList` mark non-object return values by wrapping them as
    // `{ value, [NEST_LOGGING_OPTIONS] }` so the metadata had somewhere to
    // live. Unwrap that back to the value. The metadata is read from
    // `loggingOptions` (resolved by the caller) rather than off `exitData`,
    // since by the time `res.json` has stringified the wrapper the Symbol key
    // is already gone and `exitData` is a plain string.
    const responseValue = loggingOptions?.valueIsNotObject
      ? (responseMessage as { value: unknown }).value
      : responseMessage

    return { returnExitData: responseValue as typeof exitData, responseValue }
  }
}
