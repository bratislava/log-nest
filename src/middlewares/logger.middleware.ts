import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'

import { LineLoggerSubservice } from '../logging/line-logger.subservice'
import { separateLogFromResponseObj } from '../logging/logfmt'
import { NEST_LOGGING_OPTIONS } from '../options'
import { RedactionService } from '../Sanitization/redaction.service'
import { SanitizeMetadata } from '../Sanitization/redaction.types'

const SERVER_ERROR_FROM = 500
const CLIENT_ERROR_FROM = 400

@Injectable()
export class AppLoggerMiddleware implements NestMiddleware {
  constructor(private readonly redactionService: RedactionService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const { method, originalUrl, body, ip, userAgent, userId } =
      this.extractRequestData(request)
    const startAt = process.hrtime()
    response.locals.middlewareUsed = 'true'

    const { send } = response
    response.send = (exitData: string | object | Buffer | unknown[]) => {
      response.locals.middlewareUsed = undefined

      const redactorNames =
        this.extractLoggingOptions(exitData)?.redactorNames ?? []

      const { responseLogData, logData, returnExitData } = this.parseExitData(
        response,
        exitData,
        redactorNames,
      )

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
          this.redactionService.redact(redactorNames, body),
        ),
        'response-data': responseLogData,
        ...logData,
      }
      if (response.statusCode >= SERVER_ERROR_FROM || logObj.alert === 1) {
        logger.error(logObj)
      } else if (response.statusCode >= CLIENT_ERROR_FROM) {
        logger.warn(logObj)
      } else {
        logger.log(logObj)
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

  /**
   * Reads `@Redact`'s `{ valueIsNotObject?, redactors? }` metadata directly
   * off `exitData` by its actual Symbol key. `@Redact` attaches this to any
   * object-typed return value (including arrays and Buffers, since those are
   * `typeof 'object'` too) — not only the plain-object case `parseExitData`
   * mainly deals with — so this must run before any branch decides the
   * metadata isn't there. A string `exitData` can't carry it: symbol-keyed
   * properties can't be attached to a primitive string value.
   */
  private extractLoggingOptions(
    exitData: string | object | Buffer | unknown[],
  ): SanitizeMetadata | undefined {
    if (typeof exitData !== 'object' || exitData === null) {
      return undefined
    }
    return (exitData as Record<symbol, unknown>)[NEST_LOGGING_OPTIONS] as
      SanitizeMetadata | undefined
  }

  private parseExitData(
    response: Response,
    exitData: string | object | Buffer | unknown[],
    redactorNames: readonly string[],
  ): {
    returnExitData: typeof exitData
    responseLogData: string
    logData: Record<string, unknown>
  } {
    if (
      !response
        .getHeader('content-type')
        ?.toString()
        .includes('application/json')
    ) {
      return {
        responseLogData: exitData as string,
        returnExitData: exitData,
        logData: {},
      }
    }

    let data: unknown = exitData

    // Parse string-type exitData if it is JSON
    if (typeof exitData === 'string') {
      try {
        data = JSON.parse(exitData) as unknown
      } catch {
        // If parsing fails, assume it's a plain string
        return {
          responseLogData: exitData,
          returnExitData: exitData,
          logData: {},
        }
      }
    }

    // Special handling for arrays
    if (Array.isArray(data)) {
      const redactedArray = this.redactionService.redact(redactorNames, data)
      return {
        responseLogData: JSON.stringify(redactedArray),
        returnExitData: JSON.stringify(data),
        logData: {},
      }
    }

    // Filter out keys starting with `$`. We will log them later
    const { responseLog, responseMessage } = separateLogFromResponseObj(
      typeof exitData === 'string'
        ? (JSON.parse(exitData) as object)
        : exitData,
    )

    // `@Redact` marks non-object return values by wrapping them as
    // `{ value, [NEST_LOGGING_OPTIONS] }` so the metadata had somewhere to
    // live — unwrap that back to the value.
    const responseValue = this.extractLoggingOptions(exitData)?.valueIsNotObject
      ? (responseMessage as { value: unknown }).value
      : responseMessage

    // Redact the live value structurally (same as `request-body`) before it
    // ever becomes a flat JSON string, instead of stringifying first and
    // rescanning the whole blob as text.
    const redactedResponseValue = this.redactionService.redact(
      redactorNames,
      responseValue,
    )

    return {
      returnExitData: responseValue as typeof exitData,
      responseLogData:
        typeof redactedResponseValue === 'string'
          ? redactedResponseValue
          : JSON.stringify(redactedResponseValue),
      logData: responseLog,
    }
  }
}
