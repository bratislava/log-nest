import { ErrorsEnum, ErrorsResponseEnum } from '../errors/base-errors.enum'
import { ThrowerErrorGuard } from '../errors/thrower-error.guard'

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  )
}

/** Classes using {@link CatchDatabaseError} must expose the guard under this name. */
export interface IHasThrowerErrorGuard {
  throwerErrorGuard: ThrowerErrorGuard
}

/**
 * Maps any error thrown by the decorated method into an
 * `UnprocessableEntityException` with {@link ErrorsEnum.DATABASE_ERROR}, passing
 * the original error as the cause. Preserves the method's sync/async nature.
 *
 * The host class must implement {@link IHasThrowerErrorGuard}.
 *
 * @example
 * ```ts
 * @Injectable()
 * class FormRepository implements IHasThrowerErrorGuard {
 *   constructor(public readonly throwerErrorGuard: ThrowerErrorGuard) {}
 *
 *   @CatchDatabaseError()
 *   async findForm(id: string) {
 *     return this.prisma.form.findUniqueOrThrow({ where: { id } })
 *   }
 * }
 * ```
 */
export function CatchDatabaseError() {
  return function (
    target: IHasThrowerErrorGuard,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (
      this: IHasThrowerErrorGuard,
      ...args: unknown[]
    ) => unknown

    descriptor.value = function (
      this: IHasThrowerErrorGuard,
      ...args: unknown[]
    ): unknown {
      const mapError = (error: unknown): never => {
        // non-optional per types, but a JS consumer / DI mistake can omit it
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!this.throwerErrorGuard) {
          throw new Error(
            `CatchDatabaseError decorator requires the class to have a 'throwerErrorGuard' property. ` +
              `Please ensure ${target.constructor.name} implements IHasThrowerErrorGuard.`,
          )
        }
        throw this.throwerErrorGuard.UnprocessableEntityException({
          errorEnum: ErrorsEnum.DATABASE_ERROR,
          message: ErrorsResponseEnum.DATABASE_ERROR,
          error,
        })
      }

      try {
        const result = originalMethod.apply(this, args)

        // only defer to a rejection handler when async; keep sync methods sync
        if (isPromiseLike(result)) {
          return result.then(undefined, mapError)
        }
        return result
      } catch (error) {
        return mapError(error)
      }
    }
    return descriptor
  }
}
