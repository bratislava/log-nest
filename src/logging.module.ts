import { DynamicModule, Global, Module } from '@nestjs/common'

import { ErrorFactoryService } from './errors/error-factory.service'
import { LineLoggerService } from './logging/line-logger.service'
import { NEST_LOGGING_OPTIONS, NestLoggingOptions } from './options'

/**
 * Wires up the shared logging/error-handling infrastructure.
 *
 * Register once at the app root:
 *
 * ```ts
 * imports: [ NestLoggingModule.forRoot({ alertReporting }) ]
 * ```
 *
 * `alertReporting` is the app-specific list of error-enum values that should
 * raise a Grafana alert. {@link ErrorFactoryService} and {@link LineLoggerService}
 * are provided and exported globally, so any module can inject them without
 * re-importing.
 */
@Global()
@Module({})
export class NestLoggingModule {
  static forRoot(options: NestLoggingOptions): DynamicModule {
    return {
      module: NestLoggingModule,
      providers: [
        { provide: NEST_LOGGING_OPTIONS, useValue: options },
        ErrorFactoryService,
        LineLoggerService,
      ],
      exports: [ErrorFactoryService, LineLoggerService],
    }
  }
}
