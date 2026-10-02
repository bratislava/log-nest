import {
  Body,
  Controller,
  type INestApplication,
  Post,
  Redirect,
} from '@nestjs/common'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

import { bootApp } from '../../__tests__/app'
import { loggedLineFor } from '../../__tests__/logs'
import { LogRedact } from '../../decorators/redact.decorator'
import { LogRedactionService } from '../log-redaction.service'
import { LogRedactor } from '../types/redaction.types'

const phoneRedactor: LogRedactor = {
  name: 'phone',
  redact: (line) => line.replaceAll(/\d{3}-\d{3}-\d{4}/g, '<phone>'),
}

@Controller('redirect-demo')
class RedirectDemoController {
  @Post('redact-url')
  @Redirect()
  @LogRedact('phone')
  redactUrlRedirect(@Body('phone') phone: string): { url: string } {
    return { url: `https://example.com/callback?phone=${phone}` }
  }
}

describe('AppLoggerMiddleware e2e - @LogRedact applies to @Redirect() routes', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootApp([RedirectDemoController], {
      allowShape: { phone: true },
    })
    app.get(LogRedactionService).register(phoneRedactor)
    return async () => {
      await app.close()
    }
  })

  it('per-route @LogRedact masks the logged redirect URL, not the Location header', async () => {
    const res = await request(app.getHttpServer())
      .post('/redirect-demo/redact-url')
      .send({ phone: '555-123-4567' })
      .expect(302)
    expect(res.headers.location).toBe(
      'https://example.com/callback?phone=555-123-4567',
    )

    const line = loggedLineFor('/redirect-demo/redact-url')
    expect(line['response-data']).toBe(
      'https://example.com/callback?phone=<phone>',
    )
    expect(JSON.parse(line['request-body'])).toEqual({ phone: '<phone>' })
  })
})
