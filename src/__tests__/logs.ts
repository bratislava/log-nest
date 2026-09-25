import { afterEach, beforeEach, expect, type MockInstance, vi } from 'vitest'

// Loaded for every spec via setupFiles in vitest.config.mts: records each
// console.log line so tests never read spy.mock.calls, and passes it on to the
// real console.log, where `silent: 'passed-only'` shows it only for failing
// tests.

// The color code LineLoggerSubservice puts at the start and the reset at the
// end. Only those are stripped; any in the middle weren't added by the logger,
// so they stay visible.
// eslint-disable-next-line no-control-regex -- matching the ANSI color codes themselves
const LEADING_COLOR = /^\u001B\[\d+m/
// eslint-disable-next-line no-control-regex -- matching the ANSI color codes themselves
const TRAILING_RESET = /\u001B\[0m$/

const lines: string[] = []
let consoleSpy: MockInstance<typeof console.log> | undefined

beforeEach(() => {
  lines.length = 0
  // eslint-disable-next-line no-console -- keeping a handle on the real one to pass lines through
  const original = console.log
  consoleSpy = vi
    .spyOn(console, 'log')
    .mockImplementation((...args: unknown[]) => {
      lines.push(
        args.join(' ').replace(LEADING_COLOR, '').replace(TRAILING_RESET, ''),
      )
      original(...args)
    })
})

afterEach(() => {
  consoleSpy?.mockRestore()
})

/**
 * The raw lines logged by the current test so far, without the logger's color wrapping.
 * Only for tests about the exact text; everything else uses loggedFields().
 */
export function loggedLines(): string[] {
  return lines
}

/** Every line logged by the current test so far, parsed with fieldsOf. */
export function loggedFields(): Record<string, string>[] {
  return lines.map(fieldsOf)
}

/** The parsed log line for the request to `url`; fails unless exactly one was logged. */
export function loggedLineFor(url: string): Record<string, string> {
  const matching = loggedFields().filter((fields) => fields.originalUrl === url)
  expect(matching).toHaveLength(1)
  return matching[0]
}

/**
 * The line's `key="value"` pairs, so each can be asserted on its own. Values
 * are unescaped (reversing escapeForLogfmt), so JSON ones can be JSON.parse'd.
 */
export function fieldsOf(line: string): Record<string, string> {
  return Object.fromEntries(
    // the two alternatives are mutually exclusive, so no catastrophic backtracking
    // eslint-disable-next-line sonarjs/super-linear-regex
    [...line.matchAll(/([^\s="]+)="((?:[^"\\]|\\.)*)"/g)].map(
      ([, key, value]) => [
        key,
        value.replaceAll(/\\(.)/g, (_, char: string) =>
          char === 'n' ? '\n' : char,
        ),
      ],
    ),
  )
}
