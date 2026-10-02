import { Reflector } from '@nestjs/core'
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host'
import { of } from 'rxjs'
import { describe, expect, it } from 'vitest'

import { LogAllowList } from '../../decorators/allow-list.decorator'
import { SanitizeLogMetadataInterceptor } from '../sanitize-log-metadata-interceptor.service'

class RpcHandlers {
  // decorated, so there is metadata the interceptor would write if it treated this as HTTP
  @LogAllowList({ id: true })
  handle(): void {
    // never called
  }
}

describe('SanitizeLogMetadataInterceptor', () => {
  it('passes a non-HTTP call straight through without writing to its context', () => {
    // args of an RPC call are [data, rpcContext]; switchToHttp().getResponse() would return the rpcContext
    const rpcContext = {}
    const context = new ExecutionContextHost(
      [{ id: 1 }, rpcContext],
      RpcHandlers,
      // eslint-disable-next-line vitest/unbound-method -- only read as a metadata target, never called
      RpcHandlers.prototype.handle,
    )
    context.setType('rpc')
    const handled = of('result')

    const result = new SanitizeLogMetadataInterceptor(
      new Reflector(),
    ).intercept(context, { handle: () => handled })

    expect(result).toBe(handled)
    expect(rpcContext).toEqual({})
  })
})
