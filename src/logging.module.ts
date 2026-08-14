import { DynamicModule, Global, Module } from '@nestjs/common'

import { ErrorFactory } from './errors/error-factory.service'
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
 * raise a Grafana alert. {@link ErrorFactory} is provided and exported
 * globally, so any module can inject it without re-importing.
 */
@Global()
@Module({})
export class NestLoggingModule {
  static forRoot(options: NestLoggingOptions): DynamicModule {
    return {
      module: NestLoggingModule,
      providers: [
        { provide: NEST_LOGGING_OPTIONS, useValue: options },
        ErrorFactory,
      ],
      exports: [ErrorFactory],
    }
  }
}
