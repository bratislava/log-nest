import { DynamicModule, Global, Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'

import { ErrorFactoryService } from '../errors/error-factory.service'
import { LogAllowListService } from './allow-list.service'
import { FilterByShapeOptions } from './allow-list.util'
import { LogRedactionService } from './log-redaction.service'
import { SanitizeLogMetadataInterceptor } from './sanitize-log-metadata-interceptor.service'
import { AllowShape } from './types/allow-list.types'
import { LogRedactor } from './types/redaction.types'

export interface LogSanitizationOptions {
  /**
   * Redactors applied globally: `LogRedactionService.redact()` applies them to
   * every call automatically. Routes only need `@LogRedact(...)` for extra
   * redactors on top of that baseline, not to opt into redaction at all.
   */
  redactors?: readonly LogRedactor[]
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
 * Provides {@link LogRedactionService} and {@link LogAllowListService}
 * process-wide, so any module (including one that wires up
 * `AppLoggerMiddleware`) can inject them without explicitly importing this
 * module.
 *
 * Register once at the app root:
 *
 * ```ts
 * imports: [ LogSanitizationModule.forRoot({ redactors: [piiRedactor], allowShape: { id: true } }) ]
 * ```
 */
@Global()
@Module({})
export class LogSanitizationModule {
  static forRoot(options: LogSanitizationOptions = {}): DynamicModule {
    return {
      module: LogSanitizationModule,
      providers: [
        {
          provide: LogRedactionService,
          useFactory: (errorFactoryService: ErrorFactoryService) => {
            const redactionService = new LogRedactionService(errorFactoryService)
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
        { provide: APP_INTERCEPTOR, useClass: SanitizeLogMetadataInterceptor },
      ],
      exports: [LogRedactionService, LogAllowListService],
    }
  }
}
