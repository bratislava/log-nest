import { HttpException } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'

import { loggedFields } from '../../__tests__/logs'
import { ErrorFactoryService } from '../../errors/error-factory.service'
import { LogRedactionService } from '../log-redaction.service'
import { LogRedactor } from '../types/redaction.types'

// `a` then `b` gives '<b>', `b` then `a` gives '<a>': the output shows which
// order the redactors ran in, and that each saw the previous one's output.
const aRedactor: LogRedactor = {
  name: 'a',
  redact: (line) => line.replaceAll('secret', '<a>'),
}
const bRedactor: LogRedactor = {
  name: 'b',
  redact: (line) => line.replaceAll('<a>', '<b>'),
}
const emailRedactor: LogRedactor = {
  name: 'email',
  redact: (line) => line.replaceAll('user@example.com', '<email>'),
}

describe('LogRedactionService', () => {
  let service: LogRedactionService

  beforeEach(() => {
    service = new LogRedactionService(new ErrorFactoryService())
  })

  describe('register', () => {
    it('rejects a second redactor under an already registered name', () => {
      service.register(aRedactor)

      let thrown: unknown
      try {
        service.register({ name: 'a', redact: (line) => line })
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(HttpException)
      expect((thrown as HttpException).getResponse()).toMatchObject({
        errorName: 'DUPLICATE_REDACTOR_ERROR',
      })

      // the first registration is kept, not overwritten
      expect(service.redact(['a'], 'secret')).toBe('<a>')
    })

    it('rejects a global redactor whose name is already registered', () => {
      service.register(aRedactor)
      expect(() => {
        service.registerGlobal({ name: 'a', redact: (line) => line })
      }).toThrow(HttpException)
    })
  })

  describe('redact', () => {
    it('runs the named redactors in order, each on the previous output', () => {
      service.register(aRedactor, bRedactor)
      expect(service.redact(['a', 'b'], 'secret')).toBe('<b>')
      expect(service.redact(['b', 'a'], 'secret')).toBe('<a>')
    })

    it('runs global redactors without being named, before the named ones', () => {
      service.registerGlobal(aRedactor)
      service.register(bRedactor)
      expect(service.redact([], 'secret')).toBe('<a>')
      expect(service.redact(['b'], 'secret')).toBe('<b>')
    })

    it('logs an unregistered name as UNREGISTERED_REDACTOR_ERROR and still runs the rest', () => {
      service.register(aRedactor)

      expect(service.redact(['typo', 'a'], 'secret')).toBe('<a>')
      const lines = loggedFields()
      expect(lines).toHaveLength(1)
      expect(lines[0]).toEqual({
        process: '[Nest]',
        processPID: expect.stringMatching(/^\d+$/),
        datetime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        severity: 'ERROR',
        context: 'LogRedactionService',
        errorType: 'HttpException',
        statusCode: '500',
        status: 'Internal server error',
        errorName: 'UNREGISTERED_REDACTOR_ERROR',
        message:
          'A redactor name was requested but never registered. Got: "typo".',
        alert: '0',
        stack: expect.stringMatching(
          /^HttpException: A redactor name was requested but never registered/,
        ),
      })
    })

    it('redacts values inside nested objects and arrays, but never keys', () => {
      service.register(emailRedactor)
      expect(
        service.redact(['email'], {
          'user@example.com': 'user@example.com',
          nested: { list: ['user@example.com', { deep: 'user@example.com' }] },
        }),
      ).toEqual({
        'user@example.com': '<email>',
        nested: { list: ['<email>', { deep: '<email>' }] },
      })
    })

    it('runs redactors on primitives as strings, but keeps the original value unless one changed it', () => {
      service.register({
        name: 'digits',
        redact: (line) => line.replaceAll(/\d/g, '#'),
      })
      // changed by a redactor: comes back as the redacted string
      expect(service.redact(['digits'], 1234)).toBe('####')
      // untouched: keeps its type
      expect(service.redact([], 1234)).toBe(1234)
      expect(service.redact(['digits'], null)).toBeNull()
      expect(service.redact(['digits'], true)).toBe(true)
    })

    it('passes through values JSON.stringify cannot represent, without throwing', () => {
      expect(service.redact([], undefined)).toBeUndefined()
      expect(service.redact([], 10n)).toBe(10n)
    })
  })
})
