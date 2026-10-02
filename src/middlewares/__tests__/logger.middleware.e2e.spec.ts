import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  type INestApplication,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { bootApp } from '../../__tests__/app'
import { loggedFields, loggedLineFor } from '../../__tests__/logs'

// AppLoggerMiddleware's own request/response-metadata logging - method,
// originalUrl, userAgent, userId (JWT decode), and severity selection by
// status code. None of this is about sanitization (allowShape: true
// throughout) or exception handling (nothing here throws).

@Controller()
class LoggingDemoController {
  @Get('ok')
  ok(): string {
    return 'fine'
  }

  @Get('client-error')
  @HttpCode(HttpStatus.BAD_REQUEST)
  clientError(): string {
    return 'bad input'
  }

  @Get('server-error')
  @HttpCode(HttpStatus.INTERNAL_SERVER_ERROR)
  serverError(): string {
    return 'oops'
  }

  // A manual, non-passthrough @Res() call can claim application/json while
  // sending a body that isn't actually valid JSON - parseExitData's
  // JSON.parse try/catch branch. Not reachable via a normal Nest return,
  // since res.json always produces valid JSON on its own.
  @Get('bad-json')
  badJson(@Res({ passthrough: false }) res: Response): void {
    res.setHeader('content-type', 'application/json')
    res.send('not valid json{')
  }

  // res.status() would reject 1000 up front, so set it directly: Node's
  // writeHead then throws inside res.send, the path the middleware's catch covers.
  @Get('send-throws')
  sendThrows(@Res({ passthrough: false }) res: Response): void {
    res.statusCode = 1000
    res.send('x')
  }
}

// A base64url-ish JWT shape is enough: the middleware only ever reads
// segment [1] as base64-encoded JSON, never verifies the signature.
function fakeJwt(payload: Record<string, unknown>): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64')
  return `header.${payloadB64}.signature`
}

describe('AppLoggerMiddleware e2e', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp([LoggingDemoController], { allowShape: true })
    // teardown only registered once boot succeeded, so a failed boot isn't masked
    return async () => {
      await app.close()
    }
  })

  it('logs method, originalUrl (with query string) and userAgent', async () => {
    await request(app.getHttpServer())
      .get('/ok?page=2')
      .set('User-Agent', 'my-test-agent')
      .expect(200)

    // selected by userAgent, not originalUrl, so the originalUrl assertion
    // below isn't satisfied by the lookup itself
    const matching = loggedFields().filter(
      (fields) => fields.userAgent === 'my-test-agent',
    )
    expect(matching).toHaveLength(1)
    expect(matching[0]).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'LOG',
      context: 'OK',
      method: 'GET',
      originalUrl: '/ok?page=2',
      responseTime: expect.stringMatching(/^[\d.]+$/),
      userAgent: 'my-test-agent',
      ip: expect.stringMatching(/^\S+$/),
      userId: '',
      statusCode: '200',
      'response-data': 'fine',
    })
  })

  it('decodes userId from a JWT Authorization header, without verifying it', async () => {
    await request(app.getHttpServer())
      .get('/ok')
      .set('Authorization', `Bearer ${fakeJwt({ sub: 'user-123' })}`)
      .expect(200)

    expect(loggedLineFor('/ok').userId).toBe('user-123')
  })

  it('logs a placeholder userId for a decodable JWT without a `sub` claim', async () => {
    await request(app.getHttpServer())
      .get('/ok')
      .set('Authorization', `Bearer ${fakeJwt({ name: 'no sub here' })}`)
      .expect(200)

    expect(loggedLineFor('/ok').userId).toBe('<NO USER ID>')
  })

  it('leaves userId empty rather than crashing on a garbage Authorization header', async () => {
    await request(app.getHttpServer())
      .get('/ok')
      .set('Authorization', 'not-a-jwt-at-all')
      .expect(200)

    expect(loggedLineFor('/ok').userId).toBe('')
  })

  it('logs a 4xx response at WARN severity', async () => {
    await request(app.getHttpServer()).get('/client-error').expect(400)
    expect(loggedLineFor('/client-error').severity).toBe('WARN')
  })

  it('logs a 5xx response at ERROR severity', async () => {
    await request(app.getHttpServer()).get('/server-error').expect(500)
    expect(loggedLineFor('/server-error').severity).toBe('ERROR')
  })

  it('logs the client ip and a positive numeric responseTime', async () => {
    await request(app.getHttpServer()).get('/ok').expect(200)
    const line = loggedLineFor('/ok')
    // supertest hits the app over a loopback socket, IPv4 or IPv6 depending on the environment
    // eslint-disable-next-line sonarjs/no-hardcoded-ip -- loopback, IPv4-mapped form
    expect(['127.0.0.1', '::1', '::ffff:127.0.0.1']).toContain(line.ip)
    // Number() turns a non-numeric string into NaN, which fails this too
    expect(Number(line.responseTime)).toBeGreaterThan(0)
  })

  it('falls back to the raw string when a manual response claims application/json but is not valid JSON', async () => {
    // supertest normally JSON.parses the body itself based on the
    // content-type header, which would throw here before we can assert
    // anything - override its parser to just collect the raw text instead.
    const res = await request(app.getHttpServer())
      .get('/bad-json')
      .buffer(true)
      .parse((response, callback) => {
        let data = ''
        response.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })
        response.on('end', () => {
          callback(null, data)
        })
      })
      .expect(200)
    expect(res.body).toBe('not valid json{') // client: untouched

    const line = loggedLineFor('/bad-json')
    expect(line['response-data']).toBe('not valid json{')
  })

  it('logs a failed send as a single alerting ERROR line with everything it has, and still fails the request', async () => {
    await request(app.getHttpServer()).get('/send-throws').expect(500)

    // no context: Node never got as far as setting statusMessage
    expect(loggedLineFor('/send-throws')).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'ERROR',
      errorType: 'RangeError',
      message: 'Invalid status code: 1000',
      stack: expect.stringMatching(/^RangeError: Invalid status code: 1000\n/),
      method: 'GET',
      originalUrl: '/send-throws',
      responseTime: expect.stringMatching(/^[\d.]+$/),
      userAgent: '',
      ip: expect.stringMatching(/^\S+$/),
      userId: '',
      statusCode: '1000',
      'response-data': 'x',
      alert: '1',
    })
    // ErrorFilter handles the rethrown error too, but mustn't log it again
    expect(loggedFields()).toHaveLength(1)
  })
})
