import { AllowShape } from './allow-list.types'

export interface Redactor {
  /** Unique identifier */
  name: string

  /**
   * Returns the line with every detected occurrence masked. Runs on every
   * emitted log line, so it must be fast and must never throw.
   */
  redact: (line: string) => string
}

/**
 * The effective `@Redact`/`@AllowList` config for one handler (controller +
 * endpoint level merged), written to `response.locals.sanitizeMetadata` by
 * `SanitizeMetadataInterceptor` before the handler runs, and read back by
 * `AppLoggerMiddleware` regardless of how the handler ends.
 */
export interface SanitizeMetadata {
  /** Names of the redactors `@Redact(...)` was called with for this method. */
  redactorNames?: readonly string[]
  /** Shape `@AllowList(...)` was called with for this method/controller. */
  allowShape?: AllowShape
}
