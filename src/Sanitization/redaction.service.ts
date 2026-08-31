// TODO this should be a store, where redactors can be registered and called to run by name.

import { Injectable } from '@nestjs/common'

import { ErrorEnum, ErrorResponseEnum } from '../errors/base-errors.enum'
import { ErrorFactoryService } from '../errors/error-factory.service'
import { LineLoggerSubservice } from '../logging/line-logger.subservice'
import { Redactor } from './redaction.types'

type RedactedValue<T> = unknown extends T
  ? unknown
  : T extends object
    ? T
    : string

@Injectable()
export class RedactionService {
  private readonly redactorMap: Record<string, Redactor['redact'] | undefined>

  /** Names merged into every `redact()` call. See {@link registerGlobal}. */
  private readonly globalNames: string[] = []

  private readonly logger = new LineLoggerSubservice(RedactionService.name)

  constructor(private readonly errorFactoryService: ErrorFactoryService) {
    this.redactorMap = {}
  }

  register(...redactors: Redactor[]) {
    redactors.forEach((redactor) => {
      if (Object.keys(this.redactorMap).includes(redactor.name)) {
        this.errorFactoryService.BadGatewayException({
          errorEnum: ErrorEnum.DUPLICATE_REDACTOR_ERROR,
          message: ErrorResponseEnum.DUPLICATE_REDACTOR_ERROR,
        })
      }
      this.redactorMap[redactor.name] = redactor.redact
    })
  }

  /**
   * Registers `redactors` (like {@link register}) and marks their names as
   * always-applied: every `redact()` call runs them automatically, on top of
   * whatever names it's explicitly given — so a route doesn't need
   * `@Redact(...)` just to get the process-wide baseline. Configured via
   * `SanitizationModule.forRoot(redactors)`.
   *
   * Use `register()` alone for redactors that should only run when a route
   * opts in by name via `@Redact('name')`.
   */
  registerGlobal(...redactors: Redactor[]) {
    this.register(...redactors)
    this.globalNames.push(...redactors.map((redactor) => redactor.name))
  }

  /**
   * Runs the global redactors plus the named ones over `value`, in order,
   * each receiving the previous one's output. Strings are redacted directly;
   * arrays and plain objects are walked recursively over their values (keys
   * are left as-is) — so the returned value keeps `value`'s shape and type.
   * Anything else (number, boolean, bigint, null, ...) has no shape to
   * preserve: it is best-effort JSON-stringified and redacted as a string
   * instead. `RedactedValue<T>` encodes exactly that split (object in gives
   * `T` back, everything else gives back a `string`), so the type is
   * enforced by the compiler rather than asserted by a cast at the call
   * site.
   *
   * Delegates to {@link applyRedactors} so the global-names merge happens
   * once here, not on every recursive step.
   */
  redact<T>(names: readonly string[], value: T): RedactedValue<T> {
    return this.applyRedactors(
      [...this.globalNames, ...names],
      value,
    ) as RedactedValue<T>
  }

  /**
   * A name with no registered redactor means configured redaction isn't
   * actually happening, so it's logged as an `UNREGISTERED_REDACTOR_ERROR`
   * (add that to `alertReporting` so it pages instead of failing silently)
   * rather than thrown — this runs in the logging hot path and must never
   * throw.
   */
  private applyRedactors(names: readonly string[], value: unknown): unknown {
    if (typeof value === 'string') {
      return names.reduce((current, name) => {
        const redact = this.redactorMap[name]
        if (!redact) {
          this.logger.error(
            this.errorFactoryService.InternalServerErrorException({
              errorEnum: ErrorEnum.UNREGISTERED_REDACTOR_ERROR,
              message: `${ErrorResponseEnum.UNREGISTERED_REDACTOR_ERROR} Got: "${name}".`,
            }),
          )
          return current
        }
        return redact(current)
      }, value)
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.applyRedactors(names, item))
    }

    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, entryValue]) => [
          key,
          this.applyRedactors(names, entryValue),
        ]),
      )
    }

    // JSON.stringify is typed as returning `string`, but returns `undefined`
    // for undefined/function/symbol values.
    let stringified: unknown
    try {
      stringified = JSON.stringify(value)
    } catch {
      return value
    }
    return typeof stringified === 'string'
      ? this.applyRedactors(names, stringified)
      : value
  }
}
