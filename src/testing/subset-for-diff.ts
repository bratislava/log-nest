/**
 * Whether `value` is a plain object literal, which `subsetForDiff` trims.
 * Arrays, Sets, Errors and asymmetric matchers are compared as whole values.
 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  // tagged objects (Math, JSON) and iterables (arguments, Set) aren't plain data
  if (Symbol.toStringTag in value || Symbol.iterator in value) {
    return false
  }
  const proto = Object.getPrototypeOf(value) as object | null
  // Object.prototype, from this or another realm (e.g. node:vm), is the only
  // prototype whose own prototype is null
  return proto === null || Object.getPrototypeOf(proto) === null
}

/**
 * The part of `actual` that `expected` describes, at every depth, so the diff
 * of a subset match doesn't list fields that weren't checked.
 */
export function subsetForDiff(actual: unknown, expected: unknown): unknown {
  if (
    typeof actual !== 'object' ||
    actual === null ||
    !isPlainObject(expected)
  ) {
    return actual
  }
  const record = actual as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(expected)
      .filter((key) => key in record)
      // eslint-disable-next-line security/detect-object-injection -- keys come from the test's own expectation
      .map((key) => [key, subsetForDiff(record[key], expected[key])]),
  )
}
