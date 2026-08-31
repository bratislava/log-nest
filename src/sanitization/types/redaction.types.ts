import { NEST_LOGGING_OPTIONS } from '../../options'
import { AllowShape, mergeAllowShapesInternal } from './allow-list.types'

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
 * Shape of the metadata `@Redact`/`@AllowList` attach to a method's
 * result/error under the `NEST_LOGGING_OPTIONS` symbol key, and that
 * `AppLoggerMiddleware` reads back off it.
 */
export interface SanitizeMetadata {
  /** Names of the redactors `@Redact(...)` was called with for this method. */
  redactorNames?: readonly string[]
  /** Shape `@AllowList(...)` was called with for this method/controller. */
  allowShape?: AllowShape
  /**
   * Set when the method's actual result wasn't an object — it was wrapped as
   * `{ value, [NEST_LOGGING_OPTIONS]: { valueIsNotObject: true, ... } }` so
   * the metadata had somewhere to live, and needs unwrapping back to `value`.
   */
  valueIsNotObject?: boolean
}

/**
 * Merges `patch` onto `existing`, for when more than one of `@Redact` /
 * `@AllowList` — at the method level, or a class-level `@AllowList` wrapping
 * every method — writes `NEST_LOGGING_OPTIONS` on the same result/error.
 * Without this, whichever decorator's wrapper runs last would silently
 * overwrite what an earlier one already attached, since a plain
 * `Object.assign(target, { [NEST_LOGGING_OPTIONS]: patch })` replaces the
 * whole value for that key rather than merging it.
 */
export function mergeSanitizeMetadata(
  existing: SanitizeMetadata | undefined,
  patch: SanitizeMetadata,
): SanitizeMetadata {
  return {
    redactorNames: [
      ...new Set([
        ...(existing?.redactorNames ?? []),
        ...(patch.redactorNames ?? []),
      ]),
    ],
    allowShape: mergeAllowShapesInternal(existing?.allowShape, patch.allowShape),
    valueIsNotObject: patch.valueIsNotObject ?? existing?.valueIsNotObject,
  }
}

/** Reads whatever `@Redact`/`@AllowList` has already attached to `target`, if any. */
export function readSanitizeMetadata(target: object): SanitizeMetadata | undefined {
  return (target as Record<symbol, unknown>)[NEST_LOGGING_OPTIONS] as
    | SanitizeMetadata
    | undefined
}

/**
 * Merges `patch` into whatever `NEST_LOGGING_OPTIONS` metadata `target`
 * already carries (see {@link mergeSanitizeMetadata}) and writes the result
 * back. Used by `@Redact` and `@AllowList` so stacking either of them —
 * including a class-level `@AllowList` wrapping every method — doesn't
 * clobber what another decorator already attached to the same result/error.
 */
export function attachSanitizeMetadata(
  target: object,
  patch: SanitizeMetadata,
): object {
  const merged = mergeSanitizeMetadata(readSanitizeMetadata(target), patch)
  return Object.assign(target, { [NEST_LOGGING_OPTIONS]: merged })
}
