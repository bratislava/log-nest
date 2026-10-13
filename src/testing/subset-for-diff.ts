import isPlainObject from 'is-plain-obj'

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
