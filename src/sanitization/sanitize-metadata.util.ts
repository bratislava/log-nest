import { NEST_LOGGING_OPTIONS } from '../options'
import { mergeAllowShapes } from './types/allow-list.types'
import { SanitizeMetadata } from './types/redaction.types'

/**
 * Merges `patch` onto `existing`, for when more than one of `@Redact` /
 * `@AllowList` (at the method level, or a class-level `@AllowList` wrapping
 * every method) writes `NEST_LOGGING_OPTIONS` on the same result/error.
 *
 * Without this, whichever decorator's wrapper runs last would silently
 * overwrite what an earlier one already attached, since a plain
 * `Object.assign(target, { [NEST_LOGGING_OPTIONS]: patch })` replaces the
 * whole value for that key rather than merging it.
 */
function mergeSanitizeMetadata(
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
    allowShape:
      existing?.allowShape === undefined
        ? patch.allowShape
        : patch.allowShape === undefined
          ? existing.allowShape
          : mergeAllowShapes(existing.allowShape, patch.allowShape),
    valueIsNotObject: patch.valueIsNotObject ?? existing?.valueIsNotObject,
  }
}

/** Reads whatever `@Redact`/`@AllowList` has already attached to `target`, if any. */
export function readSanitizeMetadata(
  target: object,
): SanitizeMetadata | undefined {
  return Reflect.get(target, NEST_LOGGING_OPTIONS) as
    SanitizeMetadata | undefined
}

/**
 * Merges `patch` into whatever `NEST_LOGGING_OPTIONS` metadata `target` already
 * carries (see {@link mergeSanitizeMetadata}) and writes the result back. Used
 * by `@Redact` and `@AllowList` so stacking either of them (including a
 * class-level `@AllowList` wrapping every method) doesn't override what another
 * decorator already attached to the same result/error.
 */
export function attachSanitizeMetadata(
  target: object,
  patch: SanitizeMetadata,
): object {
  const merged = mergeSanitizeMetadata(readSanitizeMetadata(target), patch)
  return Object.assign(target, { [NEST_LOGGING_OPTIONS]: merged })
}

/**
 * Copies `source`'s `@Redact`/`@AllowList` metadata onto
 * `locals.sanitizeMetadata`, since `res.json` strips it once it stringifies
 * `source`. Must run before `res.json`/`res.send`. No-op if `source` isn't an
 * object or carries no metadata.
 */
export function forwardSanitizeMetadataToLocals(
  locals: Record<string, unknown>,
  source: unknown,
): void {
  if (typeof source !== 'object' || source === null) {
    return
  }
  const meta = readSanitizeMetadata(source)
  if (meta !== undefined) {
    locals.sanitizeMetadata = meta
  }
}
