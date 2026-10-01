import {
  Controller,
  type INestApplication,
  Module,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { bootApp } from '../../__tests__/app'
import { loggedLineFor } from '../../__tests__/logs'
import { LogAllowList } from '../../decorators/allow-list.decorator'
import { LogRedact } from '../../decorators/redact.decorator'
import { LogRedactionService } from '../../sanitization/log-redaction.service'
import { LogSanitizationModule } from '../../sanitization/logSanitizationModule'
import { LogRedactor } from '../../sanitization/types/redaction.types'

// Edge cases beyond normal request/response error handling: bootstrap-time
// misconfiguration, and a thrown value that isn't even an Error.

const emailRedactor: LogRedactor = {
  name: 'email',
  redact: (line) => line.split('user@example.com').join('<email>'),
}

@Controller()
class HostileController {
  @Post('throw-non-error')
  throwNonError(): never {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately hostile: simulates a misbehaving dependency
    throw 'a plain string value, not an Error'
  }

  @Post('throw-object')
  throwObject(): never {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately hostile: simulates a misbehaving dependency
    throw { reason: 'a plain object, not an Error' }
  }

  @Post('throw-null-prototype')
  throwNullPrototype(): never {
     
    throw Object.create(null)
  }

  // No @Body() param needed: AppLoggerMiddleware reads `request.body`
  // straight off the raw Express request, already populated by Nest's body
  // parser before any guard/interceptor/pipe runs - independent of what the
  // handler itself declares.
  //
  // Namespaced under 'numeric/' rather than a bare ':id': Nest binds
  // `forRoutes(SomeController)` middleware once per route pattern the
  // controller declares, and a bare param route's pattern also textually
  // matches this controller's other literal paths (e.g. 'throw-object' as an `:id`
  // value) - which would invoke AppLoggerMiddleware twice for those routes.
  @Post('numeric/:id')
  @LogAllowList({ id: true, email: true })
  @LogRedact('email')
  pipeGuarded(@Param('id', ParseIntPipe) id: number): never {
    throw new Error(`unreachable: id ${id} should never parse`)
  }
}

describe('hostile errors e2e', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp([HostileController])
    // Route-only, so masking proves the route's own @LogRedact reached the log.
    app.get(LogRedactionService).register(emailRedactor)
    // teardown only registered once boot succeeded, so a failed boot isn't masked
    return async () => {
      await app.close()
    }
  })

  // Not an Error/HttpException, so neither ErrorFilter nor HttpExceptionFilter
  // catches it - UnknownExceptionFilter's fallback does. The client-facing
  // contract (never hang, never crash, never leak internals) must still hold.
  it('a thrown non-Error value never hangs or crashes the request, and is still fully diagnosable in the log', async () => {
    const res = await request(app.getHttpServer())
      .post('/throw-non-error')
      .timeout({ response: 1000 })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    })

    expect(loggedLineFor('/throw-non-error')).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'ERROR',
      context: 'Internal Server Error',
      method: 'POST',
      originalUrl: '/throw-non-error',
      responseTime: expect.stringMatching(/^[\d.]+$/),
      userAgent: '',
      ip: expect.stringMatching(/^\S+$/),
      userId: '',
      statusCode: '500',
      // deny by default (no allowShape, no @LogAllowList on this route)
      'response-data': '{}',
      errorType: 'UnexpectedErrorType: string',
      // the thrown value itself, same as @HandleErrors logs a thrown primitive
      message: 'a plain string value, not an Error',
    })
  })

  it('a thrown plain object is logged with its constructor name as errorType', async () => {
    const res = await request(app.getHttpServer())
      .post('/throw-object')
      .timeout({ response: 1000 })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    })

    expect(loggedLineFor('/throw-object')).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'ERROR',
      context: 'Internal Server Error',
      method: 'POST',
      originalUrl: '/throw-object',
      responseTime: expect.stringMatching(/^[\d.]+$/),
      userAgent: '',
      ip: expect.stringMatching(/^\S+$/),
      userId: '',
      statusCode: '500',
      'response-data': '{}',
      errorType: 'Object',
    })
  })

  it('a thrown null-prototype object, which has no constructor, still gets an errorType', async () => {
    const res = await request(app.getHttpServer())
      .post('/throw-null-prototype')
      .timeout({ response: 1000 })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    })

    expect(loggedLineFor('/throw-null-prototype')).toEqual({
      process: '[Nest]',
      processPID: expect.stringMatching(/^\d+$/),
      datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      severity: 'ERROR',
      context: 'Internal Server Error',
      method: 'POST',
      originalUrl: '/throw-null-prototype',
      responseTime: expect.stringMatching(/^[\d.]+$/),
      userAgent: '',
      ip: expect.stringMatching(/^\S+$/),
      userId: '',
      statusCode: '500',
      // deny by default (no allowShape, no @LogAllowList on this route)
      'response-data': '{}',
      errorType: 'Object: null prototype',
    })
  })

  // Guards run before interceptors, so a guard rejection never sees
  // SanitizeLogMetadataInterceptor's work (already covered elsewhere by the
  // guard-rejection tests). Pipes run AFTER interceptors but BEFORE the
  // handler - this is the other ordering boundary, and it was never
  // explicitly tested: per-route @LogAllowList/@LogRedact metadata must still
  // reach the log line even though the handler itself never runs.
  it('per-route @LogAllowList/@LogRedact metadata survives a Pipe validation rejection', async () => {
    const payload = { id: 1, email: 'user@example.com', secret: 'shh' }
    await request(app.getHttpServer())
      .post('/numeric/not-a-number')
      .send(payload)
      .expect(400)

    const line = loggedLineFor('/numeric/not-a-number')
    expect(JSON.parse(line['request-body'])).toEqual({
      id: 1,
      email: '<email>',
    })
  })
})

describe('bootstrap-time misconfiguration', () => {
  // LogRedactionService's factory (LogSanitizationModule.forRoot()) injects
  // ErrorFactoryService, which only NestLoggingModule provides. Forgetting
  // it is a one-line, easy-to-make mistake for a new consumer app - it must
  // fail loudly and clearly at boot, not silently or cryptically.
  it('LogSanitizationModule.forRoot() without NestLoggingModule fails app.init() with a clear DI error', async () => {
    @Module({
      imports: [LogSanitizationModule.forRoot({})],
    })
    class BrokenModule {}

    // abortOnError: false turns Nest's default `process.abort()` on a
    // bootstrap failure into an ordinary rejected promise - required to
    // observe this at all without killing the test process.
    await expect(
      NestFactory.create(BrokenModule, {
        logger: false,
        abortOnError: false,
      }),
    ).rejects.toThrow(/ErrorFactoryService/)
  })
})
