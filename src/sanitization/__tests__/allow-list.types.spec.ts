import { filterByShape, mergeAllowShapesInternal } from '../types/allow-list.types'

describe('mergeAllowShapes', () => {
  it('returns the other side when one side is undefined', () => {
    expect(mergeAllowShapesInternal(undefined, { id: true })).toEqual({ id: true })
    expect(mergeAllowShapesInternal({ id: true }, undefined)).toEqual({ id: true })
  })

  it('returns undefined when both sides are undefined', () => {
    expect(mergeAllowShapesInternal(undefined, undefined)).toBeUndefined()
  })

  it('lets `true` win over a nested shape for the same key', () => {
    expect(mergeAllowShapesInternal(true, { id: true })).toBe(true)
    expect(mergeAllowShapesInternal({ id: true }, true)).toBe(true)
  })

  it('unions disjoint keys from both sides', () => {
    expect(mergeAllowShapesInternal({ id: true }, { email: true })).toEqual({
      id: true,
      email: true,
    })
  })

  it('recursively merges a shared nested key', () => {
    expect(
      mergeAllowShapesInternal(
        { user: { id: true } },
        { user: { email: true } },
      ),
    ).toEqual({ user: { id: true, email: true } })
  })
})

describe('filterByShape', () => {
  it('drops everything when shape is undefined', () => {
    expect(filterByShape(undefined, { id: 1, email: 'a@b.com' })).toBeUndefined()
  })

  it('keeps a value unchanged when shape is `true`', () => {
    const value = { id: 1, nested: { anything: 'goes' } }
    expect(filterByShape(true, value)).toBe(value)
  })

  it('keeps only allowed keys of a plain object', () => {
    expect(
      filterByShape({ id: true }, { id: 1, email: 'a@b.com' }),
    ).toEqual({ id: 1 })
  })

  it('recurses into nested objects per the shape', () => {
    expect(
      filterByShape(
        { user: { id: true } },
        { user: { id: 1, email: 'a@b.com' }, token: 'secret' },
      ),
    ).toEqual({ user: { id: 1 } })
  })

  it('applies the same shape to every array element', () => {
    expect(
      filterByShape({ id: true }, [
        { id: 1, email: 'a@b.com' },
        { id: 2, email: 'c@d.com' },
      ]),
    ).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('drops a primitive value when the shape is not `true`', () => {
    expect(filterByShape({ id: true }, 'a string')).toBeUndefined()
  })

  it('omits a key entirely when its filtered value is undefined', () => {
    const result = filterByShape(
      { id: true },
      { id: 1, email: 'a@b.com' },
    ) as Record<string, unknown>
    expect('email' in result).toBe(false)
  })
})
