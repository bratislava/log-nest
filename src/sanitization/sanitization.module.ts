import { DynamicModule, Global, Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'

import { ErrorFactoryService } from '../errors/error-factory.service'
import { LogAllowListService } from './allow-list.service'
import { FilterByShapeOptions } from './allow-list.util'
import { RedactionService } from './redaction.service'
import { SanitizeMetadataInterceptor } from './sanitize-metadata.interceptor'
import { AllowShape } from './types/allow-list.types'
import { Redactor } from './types/redaction.types'

export interface SanitizationOptions {
  /**
   * Redactors applied globally: `RedactionService.redact()` applies them to
   * every call automatically. Routes only need `@Redact(...)` for extra
   * redactors on top of that baseline, not to opt into redaction at all.
   */
  redactors?: readonly Redactor[]
  /**
   * App-wide default logAllowList for `request-body`/`response-data`.
   * `@LogAllowList(...)` at the controller/endpoint level only ever widens it
   * further for that route, it can't narrow it. Deny by default (`{}`) when
   * omitted, so nothing is logged until something (this option or a
   * per-route `@LogAllowList`) explicitly allows it.
   */
  allowShape?: AllowShape
  /**
   * What a disallowed key/value becomes in the log: `'omit'` (default) drops
   * it entirely, `'redact'` keeps its position but replaces it with a fixed
   * placeholder - useful when you'd rather see that a field existed than
   * have it silently disappear.
   */
  onDisallowed?: NonNullable<FilterByShapeOptions['onDisallowed']>
}

/**
 * Provides {@link RedactionService} and {@link LogAllowListService}
 * process-wide, so any module (including one that wires up
 * `AppLoggerMiddleware`) can inject them without explicitly importing this
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
          provide: LogAllowListService,
          useFactory: () => {
            const logAllowListService = new LogAllowListService()
            logAllowListService.setGlobalShape(options.allowShape ?? {})
            logAllowListService.setOnDisallowed(options.onDisallowed ?? 'omit')
            return logAllowListService
          },
        },
        { provide: APP_INTERCEPTOR, useClass: SanitizeMetadataInterceptor },
      ],
      exports: [RedactionService, LogAllowListService],
    }
  }
}
