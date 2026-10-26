import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'

import { isPlainObject } from '../subset-for-diff'

class Point {
  constructor(
    readonly x = 1,
    readonly y = 2,
  ) {}
}

describe('isPlainObject', () => {
  // [case, value]
  it.each<[string, unknown]>([
    ['an empty object literal', {}],
    ['an object literal with fields', { a: 1, b: { c: 2 } }],
    ['new Object()', new Object()],
    ['an object with a null prototype', Object.create(null)],
    ['a null-prototype literal', { __proto__: null, a: 1 }],
    ['a parsed JSON object', JSON.parse('{"a":1}')],
    ['an object from another realm', runInNewContext('({ a: 1 })')],
    ['a frozen object', Object.freeze({ a: 1 })],
    ['a proxy of an object literal', new Proxy({ a: 1 }, {})],
    ['an object with symbol keys', { [Symbol('key')]: 1 }],
    ['an object with a constructor key', { constructor: 'x' }],
  ])('should accept %s', (_name, value) => {
    expect(isPlainObject(value)).toBe(true)
  })

  // [case, value]
  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'text'],
    ['a number', 1],
    ['a boolean', true],
    ['a bigint', 1n],
    ['a symbol', Symbol('value')],
    ['a function', () => undefined],
    ['a class', Point],
    ['an array', [1, 2]],
    ['an array from another realm', runInNewContext('[1, 2]')],
    ['a class instance', new Point()],
    ['an object inheriting from an object literal', Object.create({ a: 1 })],
    ['an Error', new Error('boom')],
    ['a Date', new Date()],
    ['a RegExp', /x/],
    ['a Map', new Map([[1, 'a']])],
    ['a Set', new Set([1])],
    ['a WeakMap', new WeakMap()],
    ['a Promise', Promise.resolve()],
    ['a boxed number', Object(1)],
    ['a boxed string', Object('text')],
    ['a typed array', new Uint8Array(2)],
    ['an ArrayBuffer', new ArrayBuffer(2)],
    ['Math', Math],
    ['JSON', JSON],
    ['an object with Symbol.toStringTag', { [Symbol.toStringTag]: 'Custom' }],
    [
      'an iterable object',
      {
        *[Symbol.iterator]() {
          yield 1
        },
      },
    ],
    ['an asymmetric matcher', expect.any(Number)],
    ['a containment matcher', expect.objectContaining({ a: 1 })],
  ])('should reject %s', (_name, value) => {
    expect(isPlainObject(value)).toBe(false)
  })
})
