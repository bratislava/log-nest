import {
  BadRequestException,
  type CanActivate,
  Controller,
  ForbiddenException,
  Get,
  type INestApplication,
  Injectable,
  Post,
  Redirect,
  UseGuards,
} from '@nestjs/common'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { bootApp } from '../../__tests__/app'
import { loggedLineFor } from '../../__tests__/logs'
import { LogAllowList } from '../../decorators/allow-list.decorator'
import { LogRedact } from '../../decorators/redact.decorator'
import { REDACTED_VALUE } from '../allow-list.util'
import { LogRedactionService } from '../log-redaction.service'
import { LogRedactor } from '../types/redaction.types'

const emailRedactor: LogRedactor = {
  name: 'email',
  redact: (line) => line.split('user@example.com').join('<email>'),
}

const phoneRedactor: LogRedactor = {
  name: 'phone',
  redact: (line) => line.replaceAll(/\d{3}-\d{3}-\d{4}/g, '<phone>'),
}

@Controller()
@LogAllowList({ id: true })
class DemoController {
  @Get('ping')
  ping(): string {
    return 'pong'
  }

  @Get('user')
  user(): Record<string, unknown> {
    return { id: 1, secret: 'shh' }
  }

  @Get('token')
  @LogAllowList(true)
  token(): string {
    return 'raw-token-value'
  }

  @Get('contact')
  @LogAllowList({ email: true })
  @LogRedact('email')
  contact(): Record<string, unknown> {
    return { id: 2, email: 'user@example.com' }
  }

  @Get('contact-unredacted')
  @LogAllowList({ email: true })
  contactUnredacted(): Record<string, unknown> {
    return { id: 2, email: 'user@example.com' }
  }

  @Post('throws')
  throws(): never {
    throw new BadRequestException({ id: 9, secret: 'boom' })
  }

  @Post('throws-redacted')
  @LogAllowList({ id: true, email: true })
  @LogRedact('email')
  throwsRedacted(): never {
    throw new BadRequestException({ id: 3, email: 'user@example.com' })
  }

  @Get('contact-full')
  @LogAllowList({ email: true, phone: true })
  @LogRedact('email', 'phone')
  contactFull(): Record<string, unknown> {
    return { id: 4, email: 'user@example.com', phone: '555-123-4567' }
  }
}

@Controller('exotic')
@LogAllowList({ id: true, email: true })
class ExoticController {
  @Post('void')
  @LogRedact('email')
  voidReturn(): void {
    // intentionally returns nothing
  }

  @Post('list')
  @LogRedact('email')
  listReturn(): Record<string, unknown>[] {
    return [
      { id: 1, email: 'user@example.com' },
      { id: 2, email: 'user@example.com' },
    ]
  }

  @Post('redirect')
  @Redirect('https://example.com/target', 302)
  @LogRedact('email')
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- @Redirect's static url/status does all the work
  redirectReturn(): void {}
}

@Controller('bare')
class BareController {
  @Get('secret')
  secret(): Record<string, unknown> {
    return { id: 1, secret: 'shh' }
  }

  @Get('plain-text')
  plainText(): string {
    return 'contact me at user@example.com'
  }
}

@Injectable()
class RejectingGuard implements CanActivate {
  canActivate(): never {
    throw new ForbiddenException({ id: 9, secret: 'guard-secret' })
  }
}

@Controller('guarded')
class GuardedController {
  @Get('protected')
  @UseGuards(new RejectingGuard())
  @LogAllowList(true)
  protected(): string {
    return 'never reached'
  }
}

describe('sanitization e2e - per-route decorators over a deny-all global allowShape', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp([DemoController], { allowShape: {} })
    app.get(LogRedactionService).register(emailRedactor, phoneRedactor)
    // teardown only registered once boot succeeded, so a failed boot isn't masked
    return async () => {
      await app.close()
    }
  })

  it('per-route @LogAllowList filters the log line but not the client body', async () => {
    const res = await request(app.getHttpServer()).get('/user').expect(200)
    expect(res.body).toEqual({ id: 1, secret: 'shh' }) // client: untouched

    const line = loggedLineFor('/user')
    expect(JSON.parse(line['response-data'])).toEqual({ id: 1 })
  })

  it('method-level @LogAllowList(true) logs a primitive response the class-level shape would drop', async () => {
    await request(app.getHttpServer()).get('/ping').expect(200)
    await request(app.getHttpServer()).get('/token').expect(200)

    expect(loggedLineFor('/ping')['response-data']).toBe('')
    expect(loggedLineFor('/token')['response-data']).toBe('raw-token-value')
  })

  it('class-level and method-level @LogAllowList merge instead of one replacing the other', async () => {
    await request(app.getHttpServer()).get('/contact').expect(200)

    const line = loggedLineFor('/contact')
    expect(JSON.parse(line['response-data'])).toEqual({
      id: 2,
      email: '<email>',
    })
  })

  it('a registered redactor does not run on a route without @LogRedact naming it', async () => {
    await request(app.getHttpServer()).get('/contact-unredacted').expect(200)

    const line = loggedLineFor('/contact-unredacted')
    expect(JSON.parse(line['response-data'])).toEqual({
      id: 2,
      email: 'user@example.com',
    })
  })

  it('@LogRedact("email", "phone") applies every named redactor', async () => {
    const res = await request(app.getHttpServer())
      .get('/contact-full')
      .expect(200)
    expect(res.body).toEqual({
      id: 4,
      email: 'user@example.com',
      phone: '555-123-4567',
    })

    const line = loggedLineFor('/contact-full')
    expect(JSON.parse(line['response-data'])).toEqual({
      id: 4,
      email: '<email>',
      phone: '<phone>',
    })
  })

  it('error path - @LogAllowList on a thrown error still filters the logged body', async () => {
    const res = await request(app.getHttpServer())
      .post('/throws')
      .send({ card: '4111-1111' })
      .expect(400)
    expect(res.body).toEqual({ id: 9, secret: 'boom' }) // client: untouched

    const line = loggedLineFor('/throws')
    expect(JSON.parse(line['response-data'])).toEqual({ id: 9 })
    // request-body: filtered by the class-level @LogAllowList({ id: true }) too
    expect(JSON.parse(line['request-body'])).toEqual({})
  })

  it('error path - @LogRedact on a thrown error still masks the logged body', async () => {
    const res = await request(app.getHttpServer())
      .post('/throws-redacted')
      .expect(400)
    expect(res.body).toEqual({ id: 3, email: 'user@example.com' }) // client: untouched

    const line = loggedLineFor('/throws-redacted')
    expect(JSON.parse(line['response-data'])).toEqual({
      id: 3,
      email: '<email>',
    })
  })
})

describe('sanitization e2e - onDisallowed: "redact"', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp([DemoController], {
      allowShape: {},
      onDisallowed: 'redact',
    })
    return async () => {
      await app.close()
    }
  })

  it('keeps a disallowed key in place but replaces its value with the redaction placeholder', async () => {
    const res = await request(app.getHttpServer()).get('/user').expect(200)
    expect(res.body).toEqual({ id: 1, secret: 'shh' }) // client: untouched

    const line = loggedLineFor('/user')
    expect(JSON.parse(line['response-data'])).toEqual({
      id: 1,
      secret: REDACTED_VALUE,
    })
  })
})

describe('sanitization e2e - exotic return shapes and redirects', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp([ExoticController], { allowShape: {} })
    app.get(LogRedactionService).register(emailRedactor)
    return async () => {
      await app.close()
    }
  })

  const payload = { id: 1, email: 'user@example.com', secret: 'shh' }

  it('void return: logs an empty response-data and still sanitizes the request payload', async () => {
    await request(app.getHttpServer())
      .post('/exotic/void')
      .send(payload)
      .expect(201)

    const line = loggedLineFor('/exotic/void')
    expect(line['response-data']).toBe('')
    expect(JSON.parse(line['request-body'])).toEqual({
      id: 1,
      email: '<email>',
    })
  })

  it('array return: @LogAllowList/@LogRedact apply to both the payload and every response element', async () => {
    const res = await request(app.getHttpServer())
      .post('/exotic/list')
      .send(payload)
      .expect(201)
    expect(res.body).toEqual([
      { id: 1, email: 'user@example.com' },
      { id: 2, email: 'user@example.com' },
    ])

    const line = loggedLineFor('/exotic/list')
    expect(JSON.parse(line['response-data'])).toEqual([
      { id: 1, email: '<email>' },
      { id: 2, email: '<email>' },
    ])
    expect(JSON.parse(line['request-body'])).toEqual({
      id: 1,
      email: '<email>',
    })
  })

  it('redirect: the request is still logged and sanitized like any other', async () => {
    const res = await request(app.getHttpServer())
      .post('/exotic/redirect')
      .send(payload)
      .expect(302)
    expect(res.headers.location).toBe('https://example.com/target')

    const line = loggedLineFor('/exotic/redirect')
    expect(JSON.parse(line['request-body'])).toEqual({
      id: 1,
      email: '<email>',
    })
  })
})

describe('sanitization e2e - no global allowShape configured (deny by default)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp([BareController], {})
    return async () => {
      await app.close()
    }
  })

  it('a route with no @LogAllowList at all logs nothing at all (deny by default)', async () => {
    const res = await request(app.getHttpServer())
      .get('/bare/secret')
      .expect(200)
    expect(res.body).toEqual({ id: 1, secret: 'shh' }) // client: untouched

    const line = loggedLineFor('/bare/secret')
    expect(JSON.parse(line['response-data'])).toEqual({})
  })
})

describe('sanitization e2e - plain-text (non-JSON) responses', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp([BareController], {
      allowShape: true,
      redactors: [emailRedactor],
    })
    return async () => {
      await app.close()
    }
  })

  it('a plain-text response (no decorator, non-JSON content-type) still goes through global redactors', async () => {
    const res = await request(app.getHttpServer())
      .get('/bare/plain-text')
      .expect(200)
    expect(res.text).toBe('contact me at user@example.com') // client: untouched

    const line = loggedLineFor('/bare/plain-text')
    expect(line['response-data']).toBe('contact me at <email>')
  })
})

describe('sanitization e2e - guard rejection before any handler runs', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp([GuardedController], { allowShape: { id: true } })
    return async () => {
      await app.close()
    }
  })

  it('a guard rejection is governed by the global allowShape, not the never-run per-route decorator', async () => {
    const res = await request(app.getHttpServer())
      .get('/guarded/protected')
      .expect(403)
    expect(res.body).toEqual({ id: 9, secret: 'guard-secret' }) // client: untouched

    const line = loggedLineFor('/guarded/protected')
    expect(JSON.parse(line['response-data'])).toEqual({ id: 9 })
  })
})
