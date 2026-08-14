import { NEST_LOGGING_OPTIONS } from '../options'
import { SanitizeMetadata } from '../Sanitization/redaction.types'

/**
 * TODO description
 * TODO consider moving this into sanitization module
 */
export function Redact(...redactorNames: string[]): MethodDecorator {
  return function (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod: unknown = descriptor.value
    if (typeof originalMethod !== 'function') {
      throw new TypeError(
        `@Redact can only be applied to methods, got ${typeof originalMethod}`,
      )
    }
    const method = originalMethod as (
      this: unknown,
      ...args: unknown[]
    ) => unknown

    descriptor.value = async function redactWrapper(
      this: unknown,
      ...args: unknown[]
    ): Promise<unknown> {
      let result: unknown
      try {
        result = await method.apply(this, args)
      } catch (error) {
        if (typeof error === 'object' && error !== null) {
          const metadata: SanitizeMetadata = { redactorNames }
          Object.assign(error, { [NEST_LOGGING_OPTIONS]: metadata })
        }
        throw error
      }

      if (typeof result === 'object' && result !== null) {
        const metadata: SanitizeMetadata = { redactorNames }
        return Object.assign(result, { [NEST_LOGGING_OPTIONS]: metadata })
      }
      const metadata: SanitizeMetadata = {
        valueIsNotObject: true,
        redactorNames,
      }
      return {
        value: result,
        [NEST_LOGGING_OPTIONS]: metadata,
      }
    }

    return descriptor
  }
}
