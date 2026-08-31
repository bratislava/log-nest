/**
 * A node in an allowlist shape tree: `true` allows the whole subtree at that
 * point (no further filtering, keeps whatever it is), and a nested object
 * recurses key-by-key. A key absent from the shape is dropped, whatever the
 * value at that key actually is.
 */
export type AllowShape = true | { [key: string]: AllowShape }

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
export function mergeAllowShapes(
  a: AllowShape,
  b: AllowShape,
): AllowShape {
  return mergeAllowShapesInternal(a, b) as AllowShape
}

export function mergeAllowShapesInternal(
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
    const mergedChild = mergeAllowShapesInternal(a[key], b[key])
    if (mergedChild !== undefined) {
      // eslint-disable-next-line security/detect-object-injection
      merged[key] = mergedChild
    }
  }
  return merged
}

/**
 * Recursively keeps only what `shape` allows. A key/element with no
 * corresponding shape is dropped rather than logged by default — that's the
 * whole point of an allowlist. Runs in the logging hot path (every request),
 * so it must never throw.
 */
export function filterByShape(
  shape: AllowShape | undefined,
  value: unknown,
): unknown {
  if (shape === undefined) {
    return undefined
  }
  if (shape === true) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => filterByShape(shape, item))
  }

  if (isPlainRecord(value)) {
    const filtered: Record<string, unknown> = {}
    for (const [key, entryValue] of Object.entries(value)) {
      const filteredChild = filterByShape(shape[key], entryValue)
      if (filteredChild !== undefined) {
        filtered[key] = filteredChild
      }
    }
    return filtered
  }

  // A non-`true` shape describes an object to recurse into, but `value` is a
  // primitive — there's nothing further to allow, so drop it.
  return undefined
}
