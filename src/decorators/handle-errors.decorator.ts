import { LineLoggerSubservice } from '../logging/line-logger.subservice'

/**
 * Logs (via {@link LineLoggerSubservice}) and swallows any error thrown by the
 * decorated method, resolving to `null` instead of propagating. Intended for
 * fire-and-forget tasks such as cron jobs or background work.
 *
 * @param loggerName context label for the logger.
 *
 * @example
 * ```ts
 * class Worker {
 *   @HandleErrors('Worker')
 *   async run() { ... }
 * }
 * ```
 */
export function HandleErrors(
  loggerName = 'Error Handler Decorator',
): MethodDecorator {
  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod: unknown = descriptor.value
    if (typeof originalMethod !== 'function') {
      throw new TypeError(
        `@HandleErrors can only be applied to methods, got ${typeof originalMethod}`,
      )
    }
    const method = originalMethod as (
      this: unknown,
      ...args: unknown[]
    ) => unknown
    const logger = new LineLoggerSubservice(loggerName)

    descriptor.value = async function errorHandlerWrapper(
      this: unknown,
      ...args: unknown[]
    ): Promise<unknown> {
      try {
        return await method.apply(this, args)
      } catch (error) {
        logger.error(error)
        return null
      }
    }
    return descriptor
  }
}
