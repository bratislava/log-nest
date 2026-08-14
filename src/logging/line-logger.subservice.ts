import * as process from 'node:process'

import {
  Inject,
  Injectable,
  LoggerService,
  Optional,
  Scope,
} from '@nestjs/common'
import { INQUIRER } from '@nestjs/core'

import { escapeForLogfmt, isLogfmt, toLogfmt } from './logfmt'

// ANSI color escape codes
const ANSI_RESET = '\u001B[0m'
const ANSI_GREEN = '\u001B[32m'
const ANSI_BOLD = '\u001B[1m'
const ANSI_RED = '\u001B[31m'
const ANSI_YELLOW = '\u001B[33m'
const ANSI_MAGENTA = '\u001B[35m'

function getCurrentDateTime(): string {
  return new Date().toISOString()
}

/**
 * NestJS `LoggerService` that emits each entry as a single logfmt line
 * (`key="value" …`), optimized for Grafana Loki. A string message is passed
 * through when it is already logfmt, otherwise wrapped as `message="…"`;
 * non-string args are serialized via {@link toLogfmt}.
 *
 * Usable two ways:
 * - Manually: `new LineLoggerSubservice('MyContext')`.
 * - Via DI: `constructor(private readonly logger: LineLoggerSubservice) {}` in
 * any `@Injectable()` class. Each consumer will be given its own instance, auto
 * named after the consuming class.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class LineLoggerSubservice implements LoggerService {
  protected readonly context?: string

  protected readonly color: boolean

  constructor(
    @Optional() @Inject(INQUIRER) contextOrInquirer?: string | object,
    color = true,
  ) {
    this.context =
      typeof contextOrInquirer === 'string'
        ? contextOrInquirer
        : contextOrInquirer?.constructor?.name
    this.color = color
  }

  private formatStringMessage(messages: string): string {
    if (messages.length === 0) {
      return ''
    }
    return isLogfmt(messages)
      ? messages
      : `message="${escapeForLogfmt(messages)}"`
  }

  private printLog(
    severity: string,
    message: unknown,
    optionalParams: unknown[],
    colorCode: string,
  ): void {
    const completeArray = [message, ...optionalParams]

    const stringMessages = completeArray
      .filter((item): item is string => typeof item === 'string')
      .join(' ')

    const otherItems = completeArray.filter((item) => typeof item !== 'string')

    const formattedStringMessages = this.formatStringMessage(stringMessages)

    const formattedOtherItems = otherItems
      .map((item) => toLogfmt(item))
      .join(' ')

    const formattedContext = this.context ? `context="${this.context}"` : ''

    const colorStart = this.color ? colorCode : ''
    const colorEnd = this.color ? ANSI_RESET : ''

    // this logger's purpose is to write the formatted line to stdout
    // eslint-disable-next-line no-console
    console.log(
      [
        colorStart,
        [
          `process="[Nest]"`,
          `processPID="${process.pid}"`,
          `datetime="${getCurrentDateTime()}"`,
          `severity="${severity}"`,
          formattedContext,
          formattedStringMessages,
          formattedOtherItems,
        ]
          .filter(Boolean)
          .join(' '),
        colorEnd,
      ]
        .filter(Boolean)
        .join(''),
    )
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.printLog('LOG', message, optionalParams, ANSI_GREEN)
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.printLog('FATAL', message, optionalParams, ANSI_BOLD)
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.printLog('ERROR', message, optionalParams, ANSI_RED)
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.printLog('WARN', message, optionalParams, ANSI_YELLOW)
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.printLog('DEBUG', message, optionalParams, ANSI_MAGENTA)
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.printLog('VERBOSE', message, optionalParams, '')
  }
}
