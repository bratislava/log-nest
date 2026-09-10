/**
 * Configuration for {@link NestLoggingModule.forRoot}.
 */
export interface NestLoggingOptions {
  /**
   * Error-enum values (as strings) that should raise a Grafana alert when
   * thrown — i.e. the produced exception gets `[ErrorSymbols.alert] = 1`.
   * This list is app-specific, so it is injected rather than bundled.
   */
  alertReporting: readonly string[]
}

/**
 * DI token for the injected {@link NestLoggingOptions}.
 */
export const NEST_LOGGING_OPTIONS = Symbol('NEST_LOGGING_OPTIONS')
