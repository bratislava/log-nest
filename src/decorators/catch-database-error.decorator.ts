import { ErrorEnum, ErrorResponseEnum } from '../errors/base-errors.enum'
import { ErrorFactoryService } from '../errors/error-factory.service'

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  )
}

/** Classes using {@link CatchDatabaseError} must expose the error factory service under this name. */
export interface IHasErrorFactoryService {
  errorFactoryService: ErrorFactoryService
}

/**
 * Maps any error thrown by the decorated method into an
 * `UnprocessableEntityException` with {@link ErrorEnum.DATABASE_ERROR}, passing
 * the original error as the cause. Preserves the method's sync/async nature.
 *
 * The host class must implement {@link IHasErrorFactoryService}.
 *
 * @example
 * ```ts
 * @Injectable()
 * class FormRepository implements IHasErrorFactoryService {
 *   constructor(public readonly errorFactoryService: ErrorFactoryService) {}
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
    target: IHasErrorFactoryService,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (
      this: IHasErrorFactoryService,
      ...args: unknown[]
    ) => unknown

    descriptor.value = function (
      this: IHasErrorFactoryService,
      ...args: unknown[]
    ): unknown {
      const mapError = (error: unknown): never => {
        // non-optional per types, but a JS consumer / DI mistake can omit it
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!this.errorFactoryService) {
          throw new Error(
            `CatchDatabaseError decorator requires the class to have a 'errorFactoryService' property. ` +
              `Please ensure ${target.constructor.name} implements IHasErrorFactoryService.`,
          )
        }
        throw this.errorFactoryService.UnprocessableEntityException({
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
