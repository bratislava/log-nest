import { type ExceptionFilter, NotFoundException } from '@nestjs/common'
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host'
import { describe, expect, it } from 'vitest'

import { loggedFields } from '../../__tests__/logs'
import {
  ErrorFilter,
  HttpExceptionFilter,
  UnknownExceptionFilter,
} from '../error.filter'

describe('exception filters outside HTTP', () => {
  it.each<[string, ExceptionFilter, unknown, string]>([
    ['ErrorFilter', new ErrorFilter(), new Error('boom'), 'boom'],
    [
      'HttpExceptionFilter',
      new HttpExceptionFilter(),
      new NotFoundException('gone'),
      'gone',
    ],
    [
      'UnknownExceptionFilter',
      new UnknownExceptionFilter(),
      'a plain string value',
      'a plain string value',
    ],
  ])(
    '%s logs the exception and rethrows it instead of writing an HTTP response',
    (filterName, filter, exception, message) => {
      // args of an RPC call are [data, rpcContext]; switchToHttp().getResponse() would return the rpcContext
      const rpcContext = {}
      const host = new ExecutionContextHost([{ id: 1 }, rpcContext])
      host.setType('rpc')

      let thrown: unknown
      try {
        filter.catch(exception, host)
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBe(exception)
      expect(rpcContext).toEqual({})
      expect(loggedFields()).toHaveLength(1)
      expect(loggedFields()[0]).toMatchObject({
        severity: 'ERROR',
        context: `${filterName} non HTTP`,
        message,
      })
    },
  )
})
