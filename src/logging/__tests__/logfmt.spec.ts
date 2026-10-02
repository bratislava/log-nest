import { HttpException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { fieldsOf } from '../../__tests__/logs'
import { ErrorEnum } from '../../errors/base-errors.enum'
import { ErrorFactoryService } from '../../errors/error-factory.service'
import {
  errorToLogfmt,
  escapeForLogfmt,
  isLogfmt,
  objToLogfmt,
  separateLogFromResponseObj,
  toLogfmt,
} from '../logfmt'

describe('logfmt', () => {
  describe('objToLogfmt function', () => {
    it('formats each field as key="value", space-separated', () => {
      const obj = {
        name: 'John',
        age: 30,
        city: 'New York',
      }

      const logfmt = objToLogfmt(obj)

      expect(logfmt).toBe('name="John" age="30" city="New York"')
    })

    it('returns an empty string for an empty object', () => {
      const obj = {}
      const logfmt = objToLogfmt(obj)

      expect(logfmt).toBe('')
    })

    it('leaves single quotes unescaped', () => {
      const obj = {
        name: "O'Brien",
      }
      const logfmt = objToLogfmt(obj)

      expect(logfmt).toBe('name="O\'Brien"')
    })

    it('escapes a newline as a literal \\n', () => {
      const obj = {
        address: '123 Main St.\nNew York, NY',
      }
      const logfmt = objToLogfmt(obj)

      expect(logfmt).toBe(String.raw`address="123 Main St.\nNew York, NY"`)
    })

    it('serializes nested objects as escaped JSON', () => {
      const obj = {
        key1: { subKey1: 'a', subKey2: 'b' },
        key2: { subKey2: 'c', subKey3: { subSubKey1: 'd' } },
      }
      const logfmt = objToLogfmt(obj)

      expect(logfmt).toBe(
        String.raw`key1="{\"subKey1\":\"a\",\"subKey2\":\"b\"}" key2="{\"subKey2\":\"c\",\"subKey3\":{\"subSubKey1\":\"d\"}}"`,
      )
    })

    it('escapes backslashes and double quotes', () => {
      const obj = {
        key: String.raw`a
   \ \\ \\\ \\\\ " "" """ \" "\"`,
      }
      const logfmt = objToLogfmt(obj)

      expect(logfmt).toBe(
        String.raw`key="a\n   \\ \\\\ \\\\\\ \\\\\\\\ \" \"\" \"\"\" \\\" \"\\\""`,
      )
    })

    it.each<[object, string]>([
      [{ a: 1 }, 'a="1"'],
      [{ a: true }, 'a="true"'],
      [{ a: null }, 'a="null"'],
      [{ a: [1, 2] }, 'a="[1,2]"'],
      [{ s: 'x', n: 2, b: false }, 's="x" n="2" b="false"'],
    ])('formats primitive value types: %j -> %s', (obj, expected) => {
      expect(objToLogfmt(obj)).toBe(expected)
    })

    it('flattens the console field into top-level pairs', () => {
      expect(objToLogfmt({ console: { userId: 'u1', count: 3 } })).toBe(
        'userId="u1" count="3"',
      )
    })
  })

  describe('separateLogFromResponseObj function', () => {
    it('splits symbol-keyed fields, by description, from string-keyed ones', () => {
      const obj = {
        [Symbol('log')]: 'log data',
        res: 'response data',
        [Symbol('anotherLog')]: 'more log data',
        anotherRes: 'more response data',
      }

      const { responseLog, responseMessage } = separateLogFromResponseObj(obj)

      expect(responseLog).toEqual({
        log: 'log data',
        anotherLog: 'more log data',
      })

      expect(responseMessage).toEqual({
        res: 'response data',
        anotherRes: 'more response data',
      })
    })
  })

  describe('escapeForLogfmt function', () => {
    it.each<[string, string]>([
      ['plain', 'plain'],
      ['', ''],
      ['say "hi"', String.raw`say \"hi\"`],
      ['back\\slash', String.raw`back\\slash`],
      ['line\nbreak', String.raw`line\nbreak`],
      ['This is a\\ " \\ \n string', String.raw`This is a\\ \" \\ \n string`],
    ])('escapes %j -> %j', (input, expected) => {
      expect(escapeForLogfmt(input)).toBe(expected)
    })
  })

  describe('errorToLogfmt function', () => {
    it('leaves methodName out when none is passed', () => {
      expect(fieldsOf(errorToLogfmt(new Error('boom')))).not.toHaveProperty(
        'methodName',
      )
      expect(
        fieldsOf(errorToLogfmt(new HttpException('boom', 500))),
      ).not.toHaveProperty('methodName')
    })

    it('formats an HttpException as errorType, message, methodName and stack', () => {
      const error = new HttpException('Test error message', 500)
      expect(fieldsOf(errorToLogfmt(error, 'testMethod'))).toEqual({
        errorType: 'HttpException',
        message: 'Test error message',
        methodName: 'testMethod',
        stack: expect.stringMatching(/^HttpException: Test error message\n/),
      })
    })

    it('formats an ErrorFactoryService exception with its response and log fields', () => {
      const errorFactoryService = new ErrorFactoryService({
        alertReporting: [ErrorEnum.INTERNAL_SERVER_ERROR],
      })
      const error = errorFactoryService.InternalServerErrorException({
        errorEnum: ErrorEnum.INTERNAL_SERVER_ERROR,
        message: 'Test message',
        console: 'console input',
        error: new Error('Test error message'),
      })
      expect(fieldsOf(errorToLogfmt(error, 'testMethod'))).toEqual({
        errorType: 'HttpException',
        statusCode: '500',
        status: 'Internal server error',
        errorName: 'INTERNAL_SERVER_ERROR',
        message: 'Test message',
        alert: '1',
        errorCause: 'Error',
        causedByMessage: 'Test error message',
        console: 'console input',
        methodName: 'testMethod',
        stack: expect.stringMatching(
          /^HttpException: Test message\n.*Was directly caused by:/s,
        ),
      })
    })
  })

  describe('toLogfmt function', () => {
    it('wraps a non-logfmt string as an escaped message field', () => {
      const randomString = 'This is a \n " random string!'
      const result = toLogfmt(randomString)
      expect(result).toBe(String.raw`message="This is a \n \" random string!"`)
    })

    it('passes an already-logfmt string through unchanged', () => {
      const logfmtString = 'key="value"'
      const result = toLogfmt(logfmtString)
      expect(result).toBe('key="value"')
    })

    it('formats an object as key="value" pairs', () => {
      const testObject = { key1: 'value1', key2: 'value2' }
      const result = toLogfmt(testObject)
      expect(result).toBe(`key1="${testObject.key1}" key2="${testObject.key2}"`)
    })

    it('returns an empty string for an empty string', () => {
      const emptyString = ''
      const result = toLogfmt(emptyString)
      expect(result).toBe('')
    })

    it('formats an Error as errorType, message and stack', () => {
      const error = new Error('Error message')
      expect(fieldsOf(toLogfmt(error))).toEqual({
        errorType: 'Error',
        message: 'Error message',
        stack: expect.stringMatching(/^Error: Error message\n/),
      })
    })

    it.each<[unknown, string]>([
      [0, ''],
      [false, ''],
      [null, ''],
      [undefined, ''],
      [Number.NaN, ''],
      [42, 'message="42"'],
      [true, 'message="true"'],
    ])('toLogfmt(%j) -> %j', (input, expected) => {
      expect(toLogfmt(input)).toBe(expected)
    })
  })

  describe('isLogfmt function', () => {
    it.each([
      'key="value"',
      'key=""',
      'a="1" b="2" c="3"',
      'msg="multi word value"',
      String.raw`key="with \"escaped\" quotes"`,
      String.raw`key="back\\slash"`,
      String.raw`key="literal \n marker"`,
      'a="b"',
      'key_1="value"',
      'key="value=with=equals"',
      'x="" y=""',
    ])('returns true for logfmt input: %j', (input) => {
      expect(isLogfmt(input)).toBe(true)
    })

    it.each([
      '',
      'plain text',
      'key=value',
      'key="unterminated',
      '="value"',
      'key="line\nbreak"',
      'key="line"quoted""',
      'key="line"quoted"',
      'key ="value"',
      'key= "value"',
      'key="a"extra',
      '"value"',
    ])('returns false for non-logfmt input: %j', (input) => {
      expect(isLogfmt(input)).toBe(false)
    })
  })
})
