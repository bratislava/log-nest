import { SetMetadata } from '@nestjs/common'

import { REDACT_METADATA_KEY } from '../sanitization/sanitize-metadata.keys'

/**
 * Marks a method (or every method on a class) so the named redactors mask
 * matching substrings (e.g. emails, tokens) wherever its result/error ends
 * up in a log line. The value itself is left untouched: callers still get
 * the original, unredacted data back, only what gets written to the logs is
 * scrubbed.
 *
 * Attaches the names as reflected metadata (`SetMetadata`); it never touches
 * the method itself. `SanitizeMetadataInterceptor` (registered globally by
 * `SanitizationModule.forRoot()`) reads it via `Reflector`, combining
 * controller + endpoint level, and writes the combined result to
 * `response.locals` before the handler runs.
 */
export function Redact(...redactorNames: string[]): MethodDecorator & ClassDecorator {
  return SetMetadata(REDACT_METADATA_KEY, redactorNames)
}
