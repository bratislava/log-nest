import { Injectable, Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { beforeEach, describe, expect, it, test } from 'vitest'

import { loggedFields, loggedLines, loggedRawLines } from '../../__tests__/logs'
import { NestLoggingModule } from '../../logging.module'
import { LineLoggerService } from '../line-logger.service'

describe('LineLoggerService', () => {
  let service: LineLoggerService
  beforeEach(() => {
    service = new LineLoggerService('LineLogger TEST')
  })

  test.each<
    [
      keyof Pick<
        LineLoggerService,
        'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal'
      >,
      string,
    ]
  >([
    ['log', 'LOG'],
    ['error', 'ERROR'],
    ['warn', 'WARN'],
    ['debug', 'DEBUG'],
    ['verbose', 'VERBOSE'],
    ['fatal', 'FATAL'],
  ])('should print %s message with severity %s', (method, severity) => {
    // eslint-disable-next-line security/detect-object-injection
    service[method]('test message')

    expect(loggedFields()).toEqual([
      {
        process: '[Nest]',
        processPID: expect.stringMatching(/^\d+$/),
        datetime: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        ),
        severity,
        context: 'LineLogger TEST',
        message: 'test message',
      },
    ])
  })

  it('should print log message with object as message', () => {
    service.log({ foo: 'string' })

    expect(loggedFields()).toEqual([
      {
        process: '[Nest]',
        processPID: expect.stringMatching(/^\d+$/),
        datetime: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        ),
        severity: 'LOG',
        context: 'LineLogger TEST',
        foo: 'string',
      },
    ])
  })

  // Format only: each pair's own content is covered above and in logfmt.spec.
  it.each<[string, (logger: LineLoggerService) => void]>([
    [
      'a string message',
      (logger) => {
        logger.log('test message')
      },
    ],
    [
      'an object',
      (logger) => {
        logger.log({ foo: 'string' })
      },
    ],
    [
      'an Error',
      (logger) => {
        logger.error(new Error('boom'))
      },
    ],
    [
      'an Error and an empty object',
      (logger) => {
        logger.error(new Error('boom'), {})
      },
    ],
    [
      'an empty object between other params',
      (logger) => {
        logger.error(new Error('boom'), {}, { a: 1 })
      },
    ],
    [
      'strings mixed with objects',
      (logger) => {
        logger.warn('first', { a: 1 }, 'second', { b: 2 })
      },
    ],
  ])(
    'writes %s as key="value" pairs separated by exactly one space',
    (_, logOnce) => {
      logOnce(service)

      expect(loggedLines()).toHaveLength(1)
      const [line] = loggedLines()
      // one pair, then any number of " pair": nothing before, after or between
      expect(line).toMatch(
        // eslint-disable-next-line security/detect-unsafe-regex -- the value alternatives are mutually exclusive, so no catastrophic backtracking
        /^[^\s="]+="(?:[^"\\\n]|\\.)*"(?: [^\s="]+="(?:[^"\\\n]|\\.)*")*$/,
      )
    },
  )

  it('joins every string param into one message and adds each object param as its own pairs', () => {
    service.warn('first', { a: 1 }, 'second', { b: 2 })

    expect(loggedFields()).toEqual([
      {
        process: '[Nest]',
        processPID: expect.stringMatching(/^\d+$/),
        datetime: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        ),
        severity: 'WARN',
        context: 'LineLogger TEST',
        message: 'first second',
        a: '1',
        b: '2',
      },
    ])
  })

  it('leaves the context pair out when constructed without a context', () => {
    new LineLoggerService().log('test message')

    expect(loggedFields()).toEqual([
      {
        process: '[Nest]',
        processPID: expect.stringMatching(/^\d+$/),
        datetime: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        ),
        severity: 'LOG',
        message: 'test message',
      },
    ])
  })

  it('wraps the line in its severity color and a reset by default', () => {
    service.log('test message')

    expect(loggedRawLines()).toHaveLength(1)
    expect(loggedRawLines()[0]).toMatch(
      // eslint-disable-next-line no-control-regex -- matching the ANSI color codes themselves
      /^\u001B\[32mprocess="\[Nest\]" .*\u001B\[0m$/,
    )
  })

  it('writes no ANSI codes at all with color = false', () => {
    new LineLoggerService('LineLogger TEST', false).log('test message')

    expect(loggedRawLines()).toHaveLength(1)
    expect(loggedRawLines()[0]).toMatch(/^process="\[Nest\]" /)
    expect(loggedRawLines()[0]).not.toContain('\u001B')
  })

  it('names its context after the class it is injected into', async () => {
    @Injectable()
    class FormsService {
      constructor(readonly logger: LineLoggerService) {}
    }

    @Module({
      imports: [NestLoggingModule.forRoot({ alertReporting: [] })],
      providers: [FormsService],
    })
    class TestModule {}

    const app = await NestFactory.createApplicationContext(TestModule, {
      logger: false,
    })
    try {
      app.get(FormsService).logger.log('Form created')
    } finally {
      await app.close()
    }

    expect(loggedFields()).toHaveLength(1)
    expect(loggedFields()[0].context).toBe('FormsService')
  })
})
