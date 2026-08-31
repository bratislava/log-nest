import { AllowShape } from '../sanitization/types/allow-list.types'
import { attachSanitizeMetadata } from '../sanitization/types/redaction.types'

function wrapMethod(
  descriptor: PropertyDescriptor,
  shape: AllowShape,
): PropertyDescriptor {
  const originalMethod: unknown = descriptor.value
  if (typeof originalMethod !== 'function') {
    throw new TypeError(
      `@AllowList can only be applied to methods, got ${typeof originalMethod}`,
    )
  }
  const method = originalMethod as (
    this: unknown,
    ...args: unknown[]
  ) => unknown

  descriptor.value = async function allowListWrapper(
    this: unknown,
    ...args: unknown[]
  ): Promise<unknown> {
    let result: unknown
    try {
      result = await method.apply(this, args)
    } catch (error) {
      if (typeof error === 'object' && error !== null) {
        attachSanitizeMetadata(error, { allowShape: shape })
      }
      throw error
    }

    if (typeof result === 'object' && result !== null) {
      return attachSanitizeMetadata(result, { allowShape: shape })
    }
    return attachSanitizeMetadata(
      { value: result },
      { valueIsNotObject: true, allowShape: shape },
    )
  }

  return descriptor
}

/**
 * Restricts which keys of a method's result/error may end up in
 * `request-body`/`response-data` on the `AppLoggerMiddleware` log line, on
 * top of whatever the app-wide default (`SanitizationModule.forRoot`) already
 * allows. This only ever widens the allowlist for the decorated scope, it
 * can never narrow it below the app default.
 *
 * Usable two ways, following the same wrap-and-stash pattern as `@Redact`
 * (no `Reflector`/`ExecutionContext` involved — `AppLoggerMiddleware` is
 * plain middleware and has no execution context to read reflected metadata
 * from):
 *
 * - On a method (endpoint level): wraps just that method.
 * - On a class (controller level): wraps every method on its prototype the
 *   same way, so the whole controller shares the shape.
 *
 * @example
 * ```ts
 * class UserController {
 *   @AllowList({ id: true, email: true })
 *   async getUser(id: string) { ... }
 * }
 * ```
 */
export function AllowList(shape: AllowShape): MethodDecorator & ClassDecorator {
  return function (
    target: object,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ): unknown {
    if (propertyKey !== undefined && descriptor !== undefined) {
      return wrapMethod(descriptor, shape)
    }

    const prototype = (target as { prototype: object }).prototype
    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key === 'constructor') {
        continue
      }
      // key comes from Object.getOwnPropertyNames() of the class's own prototype, not user input
       
      const methodDescriptor = Object.getOwnPropertyDescriptor(prototype, key)
      if (!methodDescriptor || typeof methodDescriptor.value !== 'function') {
        continue
      }
      Object.defineProperty(
        prototype,
        key,
        wrapMethod(methodDescriptor, shape),
      )
    }
    return target
  } as MethodDecorator & ClassDecorator
}
