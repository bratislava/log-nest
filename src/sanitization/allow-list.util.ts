import { AllowShape } from './types/allow-list.types'

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Unions two shapes: since more `@AllowList` levels (app, controller,
 * endpoint) only ever widen what's logged, a key allowed by either side ends
 * up allowed in the result. `true` on either side wins for that key.
 * `undefined` on one side means "no opinion" and the other side's shape is
 * used as-is, recursively.
 */
export function mergeAllowShapes(a: AllowShape, b: AllowShape): AllowShape {
  return mergeAllowShapesInternal(a, b) as AllowShape
}

/**
 * @returns the merged `AllowShape`, or `undefined` if both `a` and `b` are
 * `undefined`. (The `@returns` tag is required here as without it, sonarjs
 * flags the mixed `true`/object/`undefined` return as inconsistent.)
 */
function mergeAllowShapesInternal(
  a: AllowShape | undefined,
  b: AllowShape | undefined,
): AllowShape | undefined {
  if (a === undefined) {
    return b
  }
  if (b === undefined) {
    return a
  }
  if (a === true || b === true) {
    return true
  }

  const merged: Record<string, AllowShape> = {}
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    // eslint-disable-next-line security/detect-object-injection
    const mergedChild = mergeAllowShapesInternal(a[key], b[key])
    if (mergedChild !== undefined) {
      // eslint-disable-next-line security/detect-object-injection
      merged[key] = mergedChild
    }
  }
  return merged
}

/** Placeholder `filterByShape` writes in place of a disallowed value when `onDisallowed: 'redact'`. */
export const REDACTED_VALUE = '[REDACTED]'

export interface FilterByShapeOptions {
  /**
   * What to do with a key/element the shape doesn't allow: `'omit'` (default)
   * drops it entirely, `'redact'` keeps the key/position but replaces its
   * value with {@link REDACTED_VALUE}.
   */
  onDisallowed?: 'omit' | 'redact'
}

/**
 * Recursively keeps only what `shape` allows. A key/element with no
 * corresponding shape is dropped rather than logged by default, or replaced
 * with {@link REDACTED_VALUE} when `options.onDisallowed` is `'redact'`. Runs
 * in the logging hot path (every request), so it must never throw.
 */
export function filterByShape(
  shape: AllowShape | undefined,
  value: unknown,
  options: FilterByShapeOptions = {},
): unknown {
  const disallowed =
    options.onDisallowed === 'redact' ? REDACTED_VALUE : undefined

  if (shape === undefined) {
    return disallowed
  }
  if (shape === true) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => filterByShape(shape, item, options))
  }

  if (!isPlainRecord(value)) {
    // Shape describes an object to recurse into, but `value` is a primitive.
    // There's nothing further to allow, so drop it (or redact it).
    return disallowed
  }

  const filtered: Record<string, unknown> = {}
  for (const [key, entryValue] of Object.entries(value)) {
    // eslint-disable-next-line security/detect-object-injection
    const filteredChild = filterByShape(shape[key], entryValue, options)
    if (filteredChild !== undefined) {
      // eslint-disable-next-line security/detect-object-injection
      filtered[key] = filteredChild
    }
  }
  return filtered
}
