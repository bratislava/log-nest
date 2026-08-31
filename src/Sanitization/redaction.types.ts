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
 * Shape of the metadata `@Redact` attaches to a method's result/error under
 * the `NEST_LOGGING_OPTIONS` symbol key, and that `AppLoggerMiddleware` reads
 * back off it.
 */
export interface SanitizeMetadata {
  /** Names of the redactors `@Redact(...)` was called with for this method. */
  redactorNames?: readonly string[]
  /**
   * Set when the method's actual result wasn't an object — it was wrapped as
   * `{ value, [NEST_LOGGING_OPTIONS]: { valueIsNotObject: true, ... } }` so
   * the metadata had somewhere to live, and needs unwrapping back to `value`.
   */
  valueIsNotObject?: boolean
}
