/// <reference types="reflect-metadata" />

/**
 * Copies every own `reflect-metadata` entry from `from` onto `to`.
 * {@link AllowList}/{@link Redact} replace `descriptor.value` with a
 * wrapper; without this, Nest's route metadata (`@Get` etc.) stays on the
 * original function and the route 404s.
 */
export function preserveMethodMetadata(from: object, to: object): void {
  for (const key of Reflect.getOwnMetadataKeys(from) as unknown[]) {
    Reflect.defineMetadata(key, Reflect.getOwnMetadata(key, from), to)
  }
}
