import { LogRedactor } from './types/redaction.types'

/**
 * Masks email addresses. Deliberately permissive (over-matching is the safe
 * direction for a redactor: a false positive just masks a harmless string,
 * a false negative leaks PII), so it catches most real-world addresses
 * without the full RFC 5322 grammar.
 */
export const emailRedactor: LogRedactor = {
  name: 'email',
  redact: (line) =>
    line.includes('@')
      ? line.replaceAll(
          // The domain is optional so that a run of local-part characters is
          // consumed whole even when no address follows it. With the domain
          // required, every failed attempt restarts one character later in
          // the same run and rescans it to its end, which is quadratic in
          // the run length (seconds for a 100k-character token). Consuming
          // each run once keeps this linear, and only runs that do end in an
          // address are masked, so it masks exactly what the required-domain
          // pattern did.
          // Each domain segment excludes '.', so the repeated group is always
          // delimited unambiguously by the literal dot - no catastrophic
          // backtracking despite the nested-quantifier shape the rule flags.
          // eslint-disable-next-line security/detect-unsafe-regex
          /[A-Za-z0-9][A-Za-z0-9._%+-]*(?:@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})?/g,
          (match) => (match.includes('@') ? '[REDACTED:email]' : match),
        )
      : line,
}

/**
 * Masks Slovak birth numbers ("rodné číslo"): 6 date digits (`YYMMDD`,
 * month offset by +50 for women), optionally followed by `/`, then 3-4
 * control digits. Matches with or without the slash.
 *
 * The pattern is intentionally broad - it masks any isolated 9-10 digit run
 * shaped like a birth number, not only ones that decode to a real date -
 * again favoring over-matching over a missed one. Word boundaries keep it
 * from matching a 9-10 digit substring embedded in a longer number.
 */
export const birthNumberRedactor: LogRedactor = {
  name: 'birthNumber',
  redact: (line) =>
    line.replaceAll(/\b\d{6}\/?\d{3,4}\b/g, '[REDACTED:birthNumber]'),
}
