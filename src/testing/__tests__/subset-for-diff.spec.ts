import { describe, expect, it } from 'vitest'

import { subsetForDiff } from '../subset-for-diff'

class KnownRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
  }
}

class Point {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
}

describe('subsetForDiff', () => {
  describe('returns actual unchanged', () => {
    const object = { a: 1, b: 2 }
    const error = new KnownRequestError('boom', 'P2002')

    // [case, actual, expected]
    it.each<[string, unknown, unknown]>([
      ['a string', 'text', { a: 1 }],
      ['a number', 1, { a: 1 }],
      ['a boolean', true, { a: 1 }],
      ['undefined', undefined, { a: 1 }],
      ['null', null, { a: 1 }],
      ['a function', () => undefined, { a: 1 }],
    ])('when actual is %s', (_name, actual, expected) => {
      expect(subsetForDiff(actual, expected)).toBe(actual)
    })

    // [case, expected]: each is checked against a plain object and an Error as actual
    it.each<[string, unknown]>([
      ['a primitive', 1],
      ['undefined', undefined],
      ['null', null],
      ['an asymmetric matcher', expect.any(Object)],
      ['a containment matcher', expect.objectContaining({ a: 1 })],
      ['an array', [1]],
      ['a Set', new Set([1])],
      ['a Map', new Map([['a', 1]])],
      ['an Error', new Error('boom')],
      ['a Date', new Date(0)],
      ['a class instance', new Point(1, 2)],
    ])('when expected is %s', (_name, expected) => {
      expect(subsetForDiff(object, expected)).toBe(object)
      expect(subsetForDiff(error, expected)).toBe(error)
    })
  })

  describe('keeps only the keys expected describes', () => {
    // [case, actual, expected, what subsetForDiff returns]
    it.each<[string, unknown, unknown, unknown]>([
      ['an empty expectation', { a: 1, b: 2 }, {}, {}],
      ['one of several keys', { a: 1, b: 2, c: 3 }, { b: 0 }, { b: 2 }],
      [
        'the actual values, not the expected ones',
        { a: 1, b: 2 },
        { a: 'other', b: 'other' },
        { a: 1, b: 2 },
      ],
      ['a key missing from actual', { a: 1 }, { a: 1, b: 2 }, { a: 1 }],
      [
        'a key that is present but undefined',
        { a: undefined, b: 2 },
        { a: 1 },
        { a: undefined },
      ],
      [
        'nested objects at every depth',
        { a: { b: { c: 1, d: 2 }, e: 3 }, f: 4 },
        { a: { b: { c: 0 } } },
        { a: { b: { c: 1 } } },
      ],
      [
        'a nested key whose actual value is not an object',
        { a: 'text', b: 2 },
        { a: { c: 1 } },
        { a: 'text' },
      ],
      [
        'a nested key whose actual value is null',
        { a: null, b: 2 },
        { a: { c: 1 } },
        { a: null },
      ],
      [
        'an asymmetric matcher value, keeping the whole actual value',
        { a: { b: 1, c: 2 }, d: 3 },
        { a: expect.any(Object) },
        { a: { b: 1, c: 2 } },
      ],
      [
        'an array value, keeping the whole actual array',
        { a: [1, { b: 2, c: 3 }], d: 4 },
        { a: [1, { b: 2 }] },
        { a: [1, { b: 2, c: 3 }] },
      ],
      [
        'a null-prototype expectation',
        { a: 1, b: 2 },
        Object.assign(Object.create(null) as object, { a: 0 }),
        { a: 1 },
      ],
      [
        'an expectation with symbol keys, ignoring them',
        { a: 1, b: 2 },
        { a: 0, [Symbol('key')]: 1 },
        { a: 1 },
      ],
    ])('should handle %s', (_name, actual, expected, result) => {
      expect(subsetForDiff(actual, expected)).toStrictEqual(result)
    })
  })

  describe('reads the expected keys from non-plain actual values', () => {
    it('should pick own fields of an Error', () => {
      expect(
        subsetForDiff(new KnownRequestError('boom', 'P2002'), { code: '' }),
      ).toStrictEqual({ code: 'P2002' })
    })

    it('should pick inherited properties of an Error', () => {
      expect(subsetForDiff(new Error('boom'), { name: '' })).toStrictEqual({
        name: 'Error',
      })
    })

    it('should pick fields of a class instance', () => {
      expect(subsetForDiff(new Point(1, 2), { x: 0 })).toStrictEqual({ x: 1 })
    })

    it('should pick array indexes and length', () => {
      expect(subsetForDiff([1, 2], { 0: 0, length: 0 })).toStrictEqual({
        0: 1,
        length: 2,
      })
    })

    it('should return an empty object for a Set, which has no matching keys', () => {
      expect(subsetForDiff(new Set([1]), { a: 1 })).toStrictEqual({})
    })
  })

  it('should not modify actual or return it when trimming', () => {
    const actual = { a: { b: 1, c: 2 }, d: 3 }

    const result = subsetForDiff(actual, { a: { b: 0 } })

    expect(result).not.toBe(actual)
    expect(actual).toStrictEqual({ a: { b: 1, c: 2 }, d: 3 })
  })

  it('should trim the fields of a log-nest error like the matcher sees them', () => {
    const cause = new KnownRequestError('Unique constraint failed', 'P2002')
    const fields = {
      status: 500,
      errorEnum: 'DATABASE_ERROR',
      message: 'Saving form failed',
      console: { formId: 'form-123', attempt: 2 },
      error: cause,
      alert: true,
    }

    expect(
      subsetForDiff(fields, {
        status: 404,
        console: { formId: 'other' },
        error: { code: 'P2003' },
      }),
    ).toStrictEqual({
      status: 500,
      console: { formId: 'form-123' },
      error: { code: 'P2002' },
    })
  })
})
