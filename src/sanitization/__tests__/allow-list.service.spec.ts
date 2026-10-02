import { beforeEach, describe, expect, it } from 'vitest'

import { LogAllowListService } from '../allow-list.service'
import { REDACTED_VALUE } from '../allow-list.util'

const value = { id: 1, email: 'a@b.com', secret: 'shh' }

describe('LogAllowListService', () => {
  let service: LogAllowListService

  beforeEach(() => {
    service = new LogAllowListService()
  })

  it('denies everything by default, with no global or route shape', () => {
    expect(service.filter(undefined, value)).toEqual({})
  })

  it('applies the global shape alone when the route has none', () => {
    service.setGlobalShape({ id: true })
    expect(service.filter(undefined, value)).toEqual({ id: 1 })
  })

  it('applies the configured onDisallowed to the merged shape', () => {
    service.setGlobalShape({ id: true })
    service.setOnDisallowed('redact')
    expect(service.filter({ email: true }, value)).toEqual({
      id: 1,
      email: 'a@b.com',
      secret: REDACTED_VALUE,
    })
  })
})
