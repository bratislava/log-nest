// Module
export { NestLoggingModule } from './logging.module'

// Logging
export { LineLoggerSubservice } from './logging/line-logger.subservice'
export { errorToLogfmt, escapeForLogfmt, toLogfmt } from './logging/logfmt'

// Sanitization
export {
  birthNumberRedactor,
  emailRedactor,
} from './Sanitization/utils/redactor.functions'
export { RedactionService } from './Sanitization/redaction.service'
export type { Redactor } from './Sanitization/redaction.types'
export { SanitizationModule } from './Sanitization/sanitization.module'

// Errors
export { ErrorEnum, ErrorResponseEnum } from './errors/base-errors.enum'
export { ErrorFactoryService } from './errors/error-factory.service'

// Filters
export { ErrorFilter, HttpExceptionFilter } from './filters/error.filter'

// Middlewares
export { AppLoggerMiddleware } from './middlewares/logger.middleware'

// Decorators
export {
  CatchDatabaseError,
  type IHasErrorFactoryService,
} from './decorators/catch-database-error.decorator'
export { HandleErrors } from './decorators/handle-errors.decorator'
export { Redact } from './decorators/redact.decorator'
