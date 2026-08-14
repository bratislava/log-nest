import { DynamicModule, Global, Module } from '@nestjs/common'

import { ThrowerErrorGuard } from '../errors/thrower-error.guard'
import { RedactionService } from './redaction.service'
import { Redactor } from './redaction.types'

/**
 * Provides {@link RedactionService} process-wide, so any module — including
 * one that wires up `AppLoggerMiddleware` — can inject it without explicitly
 * importing this module.
 *
 * Register once at the app root:
 *
 * ```ts
 * imports: [ SanitizationModule.forRoot([piiRedactor]) ]
 * ```
 *
 * `redactors` become global: `RedactionService.redact()` applies them to
 * every call automatically. Routes only need `@Redact(...)` for extra
 * redactors on top of that baseline, not to opt into redaction at all.
 */
@Global()
@Module({})
export class SanitizationModule {
  static forRoot(redactors: readonly Redactor[] = []): DynamicModule {
    return {
      module: SanitizationModule,
      providers: [
        {
          provide: RedactionService,
          useFactory: (throwerErrorGuard: ThrowerErrorGuard) => {
            const redactionService = new RedactionService(throwerErrorGuard)
            redactionService.registerGlobal(...redactors)
            return redactionService
          },
          inject: [ThrowerErrorGuard],
        },
      ],
      exports: [RedactionService],
    }
  }
}