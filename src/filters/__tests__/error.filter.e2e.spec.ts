import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  type INestApplication,
  NotFoundException,
} from '@nestjs/common'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { bootApp } from '../../__tests__/app'
import { loggedFields, loggedLineFor } from '../../__tests__/logs'
import { ErrorEnum } from '../../errors/base-errors.enum'
import { ErrorFactoryService } from '../../errors/error-factory.service'

// Error-handling behavior only - not sanitization. allowShape stays wide
// open throughout, so nothing here is ever filtered/redacted, and any
// assertion about a field appearing (or not) in the log is purely about
// error.filter.ts / AppLoggerMiddleware's own error-handling logic.

@Controller()
class ErrorDemoController {
  constructor(private readonly errorFactory: ErrorFactoryService) {}

  @Get('crash')
  crash(): never {
    throw new Error('boom')
  }

  @Get('http-exception')
  httpException(): never {
    throw new NotFoundException({ resource: 'widget', id: 42 })
  }

  @Get('http-exception-string')
  httpExceptionString(): never {
    throw new HttpException('plain string reason', HttpStatus.BAD_REQUEST)
  }

  @Get('factory-error')
  factoryError(): never {
    throw this.errorFactory.InternalServerErrorException({
      errorEnum: ErrorEnum.INTERNAL_SERVER_ERROR,
      message: 'Something broke',
      console: { detail: 'extra context' },
    })
  }

  @Get('factory-error-with-cause')
  factoryErrorWithCause(): never {
    throw this.errorFactory.BadGatewayException({
      errorEnum: ErrorEnum.BAD_GATEWAY_ERROR,
      message: 'Downstream failed',
      error: new Error('underlying cause'),
    })
  }

  @Get('alert-worthy')
  alertWorthy(): never {
    throw this.errorFactory.BadRequestException({
      errorEnum: ErrorEnum.BAD_REQUEST_ERROR,
      message: 'flagged for alerting',
    })
  }
}

describe('error.filter e2e', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp([ErrorDemoController], { allowShape: true }, [
      ErrorEnum.BAD_REQUEST_ERROR,
    ])
    // teardown only registered once boot succeeded, so a failed boot isn't masked
    return async () => {
      await app.close()
    }
  })

  it('a plain Error becomes a 500 with a clean client body, but errorType/stack are logged', async () => {
    const res = await request(app.getHttpServer()).get('/crash').expect(500)
    expect(res.body).toEqual({
      statusCode: 500,
      message: 'boom',
    })

    const line = loggedLineFor('/crash')
    expect(line.errorType).toBe('Error')
    expect(line.stack).toMatch(/^Error: boom\n/)
  })

  it('an HttpException with an object response passes its body through untouched', async () => {
    const res = await request(app.getHttpServer())
      .get('/http-exception')
      .expect(404)
    expect(res.body).toEqual({ resource: 'widget', id: 42 })

    const line = loggedLineFor('/http-exception')
    expect(line.errorType).toBe('NotFoundException')
    expect(line.stack).toMatch(/^NotFoundException: Not Found Exception\n/)
  })

  it('an HttpException with a string response is wrapped as { response }', async () => {
    const res = await request(app.getHttpServer())
      .get('/http-exception-string')
      .expect(400)
    expect(res.body).toEqual({ response: 'plain string reason' })
  })

  it('ErrorFactoryService alert/console metadata is logged, never sent to the client', async () => {
    const res = await request(app.getHttpServer())
      .get('/factory-error')
      .expect(500)
    expect(res.body).not.toHaveProperty('console')
    expect(res.body).not.toHaveProperty('alert')

    const line = loggedLineFor('/factory-error')
    expect(line.detail).toBe('extra context')
  })

  it('ErrorFactoryService records the cause chain in the log, not the client body', async () => {
    const res = await request(app.getHttpServer())
      .get('/factory-error-with-cause')
      .expect(502)
    expect(res.body).not.toHaveProperty('errorCause')
    expect(res.body).not.toHaveProperty('causedByMessage')

    expect(loggedLineFor('/factory-error-with-cause')).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'ERROR',
      context: 'Bad Gateway',
      method: 'GET',
      originalUrl: '/factory-error-with-cause',
      responseTime: expect.stringMatching(/^[\d.]+$/),
      userAgent: '',
      ip: expect.stringMatching(/^\S+$/),
      userId: '',
      statusCode: '502',
      'response-data': JSON.stringify({
        statusCode: 502,
        status: 'Bad gateway',
        errorName: 'BAD_GATEWAY_ERROR',
        message: 'Downstream failed',
      }),
      alert: '0',
      errorCause: 'Error',
      causedByMessage: 'underlying cause',
      errorType: 'HttpException',
      stack: expect.stringMatching(/^HttpException: Downstream failed\n/),
    })
  })

  it('an alertReporting-listed error forces ERROR severity regardless of status code', async () => {
    await request(app.getHttpServer()).get('/alert-worthy').expect(400)

    // a plain 400 would log as WARN; alert=1 must force ERROR instead
    expect(loggedLineFor('/alert-worthy')).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'ERROR',
      context: 'Bad Request',
      method: 'GET',
      originalUrl: '/alert-worthy',
      responseTime: expect.stringMatching(/^[\d.]+$/),
      userAgent: '',
      ip: expect.stringMatching(/^\S+$/),
      userId: '',
      statusCode: '400',
      'response-data': JSON.stringify({
        statusCode: 400,
        status: 'Bad Request',
        errorName: 'BAD_REQUEST_ERROR',
        message: 'flagged for alerting',
      }),
      alert: '1',
      errorType: 'HttpException',
      stack: expect.stringMatching(/^HttpException: flagged for alerting\n/),
    })
  })

  // Regression test: respondOrLog's `else` branch (no AppLoggerMiddleware in
  // play - e.g. no route matched at all) used to never call response.json/
  // response.send, hanging the client forever. The timeout keeps a
  // regression failing fast instead of hanging the suite.
  it('a route unmatched by any controller still gets a response, and the filter logs it itself', async () => {
    const res = await request(app.getHttpServer())
      .get('/does-not-exist')
      .timeout({ response: 1000 })
    expect(res.status).toBe(404)
    // client-safe body only - no leaked stack trace / internal-only fields
    expect(res.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot GET /does-not-exist',
    })

    // no originalUrl here (AppLoggerMiddleware never ran), so match on the message
    const matching = loggedFields().filter(
      (fields) => fields.message === 'Cannot GET /does-not-exist',
    )
    expect(matching).toHaveLength(1)
    expect(matching[0]).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'ERROR',
      context: 'HttpExceptionFilter',
      errorType: 'NotFoundException',
      message: 'Cannot GET /does-not-exist',
      error: 'Not Found',
      statusCode: '404',
      stack: expect.stringMatching(
        /^NotFoundException: Cannot GET \/does-not-exist\n/,
      ),
    })
  })
})
