import { Console } from 'node:console'
import { Writable } from 'node:stream'
import { inspect } from 'node:util'

import { ConsoleLogger, HttpStatus } from '@nestjs/common'
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loggedLines } from '../../__tests__/logs'
import { LineLoggerService } from '../../logging/line-logger.service'
import { ErrorEnum, ErrorResponseEnum } from '../base-errors.enum'
import { ErrorFactoryService } from '../error-factory.service'
import { ErrorSymbols } from '../error-symbols'
import { ResponseErrorInternalDto } from '../response-error.dto'

describe('ErrorFactoryService', () => {
  let errorFactoryService: ErrorFactoryService

  beforeEach(() => {
    // alertReporting is injected via NestLoggingModule.forRoot() in the app; here
    // we construct the errorFactoryService directly with the list the alert assertions rely on.
    errorFactoryService = new ErrorFactoryService({
      alertReporting: [
        ErrorEnum.DATABASE_ERROR,
        ErrorEnum.BAD_GATEWAY_AUTH_ERROR,
      ],
    })
  })

  describe('alerting', () => {
    it('alerts for an errorEnum listed in alertReporting', () => {
      const result = errorFactoryService
        .BadRequestException({
          errorEnum: ErrorEnum.DATABASE_ERROR,
          message: 'Some message',
        })
        .getResponse() as ResponseErrorInternalDto

      expect(result[ErrorSymbols.alert]).toBe(1)
    })

    it('does not alert for an errorEnum not listed in alertReporting', () => {
      const result = errorFactoryService
        .BadRequestException({
          errorEnum: ErrorEnum.NOT_FOUND_ERROR,
          message: 'Some message',
        })
        .getResponse() as ResponseErrorInternalDto

      expect(result[ErrorSymbols.alert]).toBe(0)
    })
  })

  describe('cause', () => {
    const cause = Object.assign(new Error('db down'), { code: 'P1001' })
    const createException = () =>
      errorFactoryService.InternalServerErrorException({
        errorEnum: ErrorEnum.DATABASE_ERROR,
        message: 'Some message',
        error: cause,
      })

    it('keeps the original error under ErrorSymbols.originalErrorForTesting', () => {
      expect(
        Reflect.get(createException(), ErrorSymbols.originalErrorForTesting),
      ).toBe(cause)
    })

    it('does not expose the cause to inspect, JSON or `.cause` readers', () => {
      const exception = createException()

      expect(exception.cause).toBeUndefined()
      expect(inspect(exception)).not.toContain('P1001')
      expect(JSON.stringify(exception)).not.toContain('P1001')
    })

    it('does not print the cause with console.log', () => {
      let output = ''
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          output += String(chunk)
          callback()
        },
      })

      new Console(stream).log(createException())

      expect(output).toContain('Some message')
      expect(output).not.toContain('P1001')
    })

    it('does not log the cause with LineLoggerService', () => {
      new LineLoggerService('Ctx', false).error(createException())

      expect(loggedLines().join('\n')).toContain('Some message')
      expect(loggedLines().join('\n')).not.toContain('P1001')
    })

    it.each([
      ['plain', {}],
      ['json', { json: true }],
    ])(
      "does not log the cause with Nest's %s ConsoleLogger",
      (_mode, options) => {
        const stderr = vi
          .spyOn(process.stderr, 'write')
          .mockImplementation(() => true)

        new ConsoleLogger('Ctx', { colors: false, ...options }).error(
          createException(),
        )
        const output = stderr.mock.calls
          .map(([chunk]) => String(chunk))
          .join('')
        stderr.mockRestore()

        expect(output).toContain('Some message')
        expect(output).not.toContain('P1001')
      },
    )
  })

  describe('fromAxiosError', () => {
    // `fromAxiosError` only reads `response.status` and `response.headers`; everything
    // else is filler to keep the AxiosError shape honest for the type system.
    const createMockAxiosError = ({
      status,
      headers = {},
    }: {
      status?: number
      headers?: Record<string, string>
    } = {}): AxiosError => {
      const config: InternalAxiosRequestConfig = {
        url: 'https://downstream.example.com/resource',
        method: 'get',
        headers: new AxiosHeaders({ Accept: 'application/json' }),
      }

      const response =
        status === undefined
          ? undefined
          : {
              status,
              statusText: '',
              headers,
              config,
              data: undefined,
            }

      return new AxiosError(
        status === undefined
          ? 'Network Error'
          : `Request failed with status code ${status}`,
        status === undefined ? 'ERR_NETWORK' : 'ERR_BAD_RESPONSE',
        config,
        undefined,
        response,
      )
    }

    describe('statusOverrides branch', () => {
      it('takes precedence over the 503 + retry-after branch', () => {
        const error = createMockAxiosError({
          status: HttpStatus.SERVICE_UNAVAILABLE,
          headers: { 'retry-after': '30' },
        })

        const result = errorFactoryService.fromAxiosError(error, {
          statusOverrides: {
            [HttpStatus.SERVICE_UNAVAILABLE]: {
              status: HttpStatus.BAD_REQUEST,
              errorEnum: ErrorEnum.BAD_REQUEST_ERROR,
              message: 'Override wins',
            },
          },
        })

        expect(result.getStatus()).toBe(HttpStatus.BAD_REQUEST)
        const response = result.getResponse() as ResponseErrorInternalDto
        expect(response.errorName).toBe(ErrorEnum.BAD_REQUEST_ERROR)
        expect(response.message).toBe('Override wins')
        expect(response.status).toBe('Bad Request')
      })

      it('ignores options.errorEnumOverwrite and options.message on the override path', () => {
        const error = createMockAxiosError({ status: 500 })

        const response = errorFactoryService
          .fromAxiosError(error, {
            message: 'top-level message',
            errorEnumOverwrite: ErrorEnum.DATABASE_ERROR,
            statusOverrides: {
              500: {
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                errorEnum: ErrorEnum.INTERNAL_SERVER_ERROR,
                message: 'override message',
              },
            },
          })
          .getResponse() as ResponseErrorInternalDto

        expect(response.message).toBe('override message')
        expect(response.errorName).toBe(ErrorEnum.INTERNAL_SERVER_ERROR)
      })

      it('falls through when the downstream status does not match any override entry', () => {
        const error = createMockAxiosError({ status: 500 })

        const result = errorFactoryService.fromAxiosError(error, {
          statusOverrides: {
            404: {
              status: HttpStatus.NOT_FOUND,
              errorEnum: ErrorEnum.NOT_FOUND_ERROR,
              message: 'not used',
            },
          },
        })

        expect(result.getStatus()).toBe(HttpStatus.BAD_GATEWAY)
        const response = result.getResponse() as ResponseErrorInternalDto
        expect(response.errorName).toBe(ErrorEnum.BAD_GATEWAY_ERROR)
      })

      it('falls back to options.message for status text when STATUS_CODES has no entry', () => {
        const error = createMockAxiosError({ status: 599 })

        const response = errorFactoryService
          .fromAxiosError(error, {
            message: 'fallback status text',
            statusOverrides: {
              599: {
                status: 599,
                errorEnum: ErrorEnum.BAD_GATEWAY_ERROR,
                message: 'override message',
              },
            },
          })
          .getResponse() as ResponseErrorInternalDto

        expect(response.status).toBe('fallback status text')
        expect(response.message).toBe('override message')
      })
    })

    describe('503 + retry-after branch', () => {
      it('returns ServiceUnavailable with default enum and message', () => {
        const error = createMockAxiosError({
          status: HttpStatus.SERVICE_UNAVAILABLE,
          headers: { 'retry-after': '30' },
        })

        const result = errorFactoryService.fromAxiosError(error, {})

        expect(result.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE)
        const response = result.getResponse() as ResponseErrorInternalDto
        expect(response.errorName).toBe(ErrorEnum.SERVICE_UNAVAILABLE_ERROR)
        expect(response.message).toBe(
          ErrorResponseEnum.SERVICE_UNAVAILABLE_ERROR,
        )
        expect(response[ErrorSymbols.alert]).toBe(0)
      })

      it('falls through to the default branch when retry-after header is absent', () => {
        const error = createMockAxiosError({
          status: HttpStatus.SERVICE_UNAVAILABLE,
        })

        const result = errorFactoryService.fromAxiosError(error, {})

        expect(result.getStatus()).toBe(HttpStatus.BAD_GATEWAY)
        const response = result.getResponse() as ResponseErrorInternalDto
        expect(response.errorName).toBe(ErrorEnum.BAD_GATEWAY_ERROR)
      })
    })

    describe('401/403 branch', () => {
      it.each([
        ['401', HttpStatus.UNAUTHORIZED],
        ['403', HttpStatus.FORBIDDEN],
      ] as const)(
        'maps %s to BadGateway with BAD_GATEWAY_AUTH_ERROR',
        (_, status) => {
          const error = createMockAxiosError({ status })

          const result = errorFactoryService.fromAxiosError(error, {})

          expect(result.getStatus()).toBe(HttpStatus.BAD_GATEWAY)
          const response = result.getResponse() as ResponseErrorInternalDto
          expect(response.errorName).toBe(ErrorEnum.BAD_GATEWAY_AUTH_ERROR)
          expect(response.message).toBe(
            ErrorResponseEnum.BAD_GATEWAY_AUTH_ERROR,
          )
          expect(response[ErrorSymbols.alert]).toBe(1)
        },
      )
    })

    describe('default branch', () => {
      it('maps an unhandled downstream status to BadGateway with BAD_GATEWAY_ERROR', () => {
        const error = createMockAxiosError({ status: 500 })

        const result = errorFactoryService.fromAxiosError(error, {})

        expect(result.getStatus()).toBe(HttpStatus.BAD_GATEWAY)
        const response = result.getResponse() as ResponseErrorInternalDto
        expect(response.errorName).toBe(ErrorEnum.BAD_GATEWAY_ERROR)
        expect(response.message).toBe(ErrorResponseEnum.BAD_GATEWAY_ERROR)
        expect(response[ErrorSymbols.alert]).toBe(0)
      })

      it('handles a network error (no response on the AxiosError)', () => {
        const error = createMockAxiosError()

        const result = errorFactoryService.fromAxiosError(error, {})

        expect(result.getStatus()).toBe(HttpStatus.BAD_GATEWAY)
        const response = result.getResponse() as ResponseErrorInternalDto
        expect(response.errorName).toBe(ErrorEnum.BAD_GATEWAY_ERROR)
      })

      it('honours errorEnumOverwrite and options.message', () => {
        const error = createMockAxiosError({ status: 500 })

        const response = errorFactoryService
          .fromAxiosError(error, {
            errorEnumOverwrite: ErrorEnum.DATABASE_ERROR,
            message: 'something else',
          })
          .getResponse() as ResponseErrorInternalDto

        expect(response.errorName).toBe(ErrorEnum.DATABASE_ERROR)
        expect(response.message).toBe('something else')
        expect(response[ErrorSymbols.alert]).toBe(1)
      })
    })
  })
})
