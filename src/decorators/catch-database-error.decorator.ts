import { ErrorEnum, ErrorResponseEnum } from '../errors/base-errors.enum'
import { ErrorFactory } from '../errors/error-factory.service'

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  )
}

/** Classes using {@link CatchDatabaseError} must expose the guard under this name. */
export interface IHasErrorFactory {
  errorFactory: ErrorFactory
}

/**
 * Maps any error thrown by the decorated method into an
 * `UnprocessableEntityException` with {@link ErrorEnum.DATABASE_ERROR}, passing
 * the original error as the cause. Preserves the method's sync/async nature.
 *
 * The host class must implement {@link IHasErrorFactory}.
 *
 * @example
 * ```ts
 * @Injectable()
 * class FormRepository implements IHasErrorFactory {
 *   constructor(public readonly errorFactory: ErrorFactory) {}
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
    target: IHasErrorFactory,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (
      this: IHasErrorFactory,
      ...args: unknown[]
    ) => unknown

    descriptor.value = function (
      this: IHasErrorFactory,
      ...args: unknown[]
    ): unknown {
      const mapError = (error: unknown): never => {
        // non-optional per types, but a JS consumer / DI mistake can omit it
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!this.errorFactory) {
          throw new Error(
            `CatchDatabaseError decorator requires the class to have a 'errorFactory' property. ` +
              `Please ensure ${target.constructor.name} implements IHasErrorFactory.`,
          )
        }
        throw this.errorFactory.UnprocessableEntityException({
          errorEnum: ErrorEnum.DATABASE_ERROR,
          message: ErrorResponseEnum.DATABASE_ERROR,
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
