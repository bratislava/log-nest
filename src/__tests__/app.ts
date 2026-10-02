import {
  type INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  type Type,
} from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import {
  ErrorFilter,
  HttpExceptionFilter,
  UnknownExceptionFilter,
} from '../filters/error.filter'
import { NestLoggingModule } from '../logging.module'
import { AppLoggerMiddleware } from '../middlewares/logger.middleware'
import {
  LogSanitizationModule,
  type LogSanitizationOptions,
} from '../sanitization/logSanitizationModule'

/**
 * A listening app wired the way the README tells consumers to: both modules,
 * AppLoggerMiddleware on `controllers`, and all three exception filters.
 */
export async function bootApp(
  controllers: Type[],
  sanitization: LogSanitizationOptions = {},
  alertReporting: readonly string[] = [],
): Promise<INestApplication> {
  @Module({
    imports: [
      NestLoggingModule.forRoot({ alertReporting }),
      LogSanitizationModule.forRoot(sanitization),
    ],
    controllers,
  })
  class TestModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer.apply(AppLoggerMiddleware).forRoutes(...controllers)
    }
  }

  const app = await NestFactory.create(TestModule, { logger: false })
  // Nest reverses this array before matching, so the first-registered
  // filter is actually checked last - UnknownExceptionFilter (@Catch(),
  // matches everything) must come first to only ever act as a fallback.
  app.useGlobalFilters(
    new UnknownExceptionFilter(),
    new ErrorFilter(),
    new HttpExceptionFilter(),
  )
  // Bound once for the app's lifetime: given an unbound server, supertest
  // listens and closes on a fresh port per request, which races across test
  // workers (requests land on another suite's app).
  await app.listen(0, '127.0.0.1')
  return app
}
