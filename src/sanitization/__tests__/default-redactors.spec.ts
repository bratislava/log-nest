import { describe, expect, it } from 'vitest'

import { birthNumberRedactor, emailRedactor } from '../default-redactors'

describe('emailRedactor', () => {
  it('masks a single email address', () => {
    expect(emailRedactor.redact('contact me at user@example.com')).toBe(
      'contact me at [REDACTED:email]',
    )
  })

  it('masks every email address in the line', () => {
    expect(
      emailRedactor.redact('from user@example.com to admin@example.org'),
    ).toBe('from [REDACTED:email] to [REDACTED:email]')
  })

  it('leaves text with no email address untouched', () => {
    expect(emailRedactor.redact('nothing to see here')).toBe(
      'nothing to see here',
    )
  })

  it('handles dots, plus signs, and subdomains in the local/domain parts', () => {
    expect(
      emailRedactor.redact('reach first.last+tag@mail.example.co.uk now'),
    ).toBe('reach [REDACTED:email] now')
  })

  it('does not match a bare "@" with no valid domain', () => {
    expect(emailRedactor.redact('just an @ sign, not an email')).toBe(
      'just an @ sign, not an email',
    )
  })

  it.each([
    [
      'first@example.com_second@example.org',
      '[REDACTED:email]_[REDACTED:email]',
    ],
    ['user@host@example.com', 'user@[REDACTED:email]'],
    ['+421user@example.com', '+[REDACTED:email]'],
    ['.@example.com@example.org', '.@[REDACTED:email]'],
  ])('masks adjacent and overlapping candidates in %j', (line, expected) => {
    expect(emailRedactor.redact(line)).toBe(expected)
  })

  it('handles a long run of local-part characters in linear time', () => {
    // 60k characters: a few milliseconds when linear, seconds when quadratic.
    // The regex runs synchronously, so a test timeout couldn't interrupt it.
    const token = 'Qm9va+'.repeat(10_000)
    const start = performance.now()

    expect(emailRedactor.redact(`${token}@`)).toBe(`${token}@`)
    expect(emailRedactor.redact(`${token}@example.com`)).toBe(
      '[REDACTED:email]',
    )
    expect(performance.now() - start).toBeLessThan(500)
  })
})

describe('birthNumberRedactor', () => {
  it('masks a birth number written with a slash', () => {
    expect(birthNumberRedactor.redact('rc: 760512/1234')).toBe(
      'rc: [REDACTED:birthNumber]',
    )
  })

  it('masks a birth number written without a slash', () => {
    expect(birthNumberRedactor.redact('rc: 7605121234')).toBe(
      'rc: [REDACTED:birthNumber]',
    )
  })

  it('masks the 3-digit control variant (pre-1954 format)', () => {
    expect(birthNumberRedactor.redact('rc: 760512/123')).toBe(
      'rc: [REDACTED:birthNumber]',
    )
  })

  it('masks every birth number in the line', () => {
    expect(
      birthNumberRedactor.redact('parent 760512/1234 child 245678/9012'),
    ).toBe('parent [REDACTED:birthNumber] child [REDACTED:birthNumber]')
  })

  it('leaves text with no birth-number-shaped digits untouched', () => {
    expect(birthNumberRedactor.redact('order #4231, qty 12')).toBe(
      'order #4231, qty 12',
    )
  })

  it('does not match a 9-10 digit run embedded inside a longer number', () => {
    expect(birthNumberRedactor.redact('reference 1234567890123456')).toBe(
      'reference 1234567890123456',
    )
  })
})
