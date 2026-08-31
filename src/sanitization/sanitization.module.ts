import { DynamicModule, Global, Module } from '@nestjs/common'

import { ErrorFactoryService } from '../errors/error-factory.service'
import { AllowListService } from './allow-list.service'
import { AllowShape } from './types/allow-list.types'
import { RedactionService } from './redaction.service'
import { Redactor } from './types/redaction.types'

export interface SanitizationOptions {
  /**
   * Redactors applied globally: `RedactionService.redact()` applies them to
   * every call automatically. Routes only need `@Redact(...)` for extra
   * redactors on top of that baseline, not to opt into redaction at all.
   */
  redactors?: readonly Redactor[]
  /**
   * App-wide default allowlist for `request-body`/`response-data`.
   * `@AllowList(...)` at the controller/endpoint level only ever widens it
   * further for that route, it can't narrow it. Omit to keep today's
   * behavior (`true` — nothing filtered) until routes opt in.
   */
  allowShape?: AllowShape
}

/**
 * Provides {@link RedactionService} and {@link AllowListService}
 * process-wide, so any module — including one that wires up
 * `AppLoggerMiddleware` — can inject them without explicitly importing this
 * module.
 *
 * Register once at the app root:
 *
 * ```ts
 * imports: [ SanitizationModule.forRoot({ redactors: [piiRedactor], allowShape: { id: true } }) ]
 * ```
 */
@Global()
@Module({})
export class SanitizationModule {
  static forRoot(options: SanitizationOptions = {}): DynamicModule {
    return {
      module: SanitizationModule,
      providers: [
        {
          provide: RedactionService,
          useFactory: (errorFactoryService: ErrorFactoryService) => {
            const redactionService = new RedactionService(errorFactoryService)
            redactionService.registerGlobal(...(options.redactors ?? []))
            return redactionService
          },
          inject: [ErrorFactoryService],
        },
        {
          provide: AllowListService,
          useFactory: () => {
            const allowListService = new AllowListService()
            allowListService.setGlobalShape(options.allowShape ?? true)
            return allowListService
          },
        },
      ],
      exports: [RedactionService, AllowListService],
    }
  }
}
