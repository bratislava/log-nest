// Module
export { NestLoggingModule } from './logging.module'

// Logging
export { LineLoggerSubservice } from './logging/line-logger.subservice'
export { errorToLogfmt, escapeForLogfmt, toLogfmt } from './logging/logfmt'

// Sanitization
export { AllowListService } from './sanitization/allow-list.service'
export { RedactionService } from './sanitization/redaction.service'
export {
  SanitizationModule,
  type SanitizationOptions,
} from './sanitization/sanitization.module'
export type { AllowShape } from './sanitization/types/allow-list.types'
export type { Redactor, SanitizeMetadata } from './sanitization/types/redaction.types'

// Errors
export { ErrorEnum, ErrorResponseEnum } from './errors/base-errors.enum'
export { ErrorFactoryService } from './errors/error-factory.service'

// Filters
export { ErrorFilter, HttpExceptionFilter } from './filters/error.filter'

// Middlewares
export { AppLoggerMiddleware } from './middlewares/logger.middleware'

// Decorators
export { AllowList } from './decorators/allow-list.decorator'
export {
  CatchDatabaseError,
  type IHasErrorFactoryService,
} from './decorators/catch-database-error.decorator'
export { HandleErrors } from './decorators/handle-errors.decorator'
export { Redact } from './decorators/redact.decorator'
