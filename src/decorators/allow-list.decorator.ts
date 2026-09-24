import { SetMetadata } from '@nestjs/common'

import { ALLOW_LIST_METADATA_KEY } from '../sanitization/sanitize-metadata.keys'
import { LogAllowShape } from '../sanitization/types/allow-list.types'

/**
 * Restricts which keys of a method's result/error may end up in
 * `request-body`/`response-data` on the `AppLoggerMiddleware` log line, on
 * top of whatever the app-wide default (`LogSanitizationModule.forRoot`) already
 * allows. This only ever widens the allowlist for the decorated scope, it
 * can never narrow it below the app default.
 *
 * Attaches the shape as reflected metadata (`SetMetadata`); it never touches
 * the method itself. `SanitizeLogMetadataInterceptor` (registered globally by
 * `LogSanitizationModule.forRoot()`) reads it via `Reflector`, merging
 * controller + endpoint level, and writes the merged result to
 * `response.locals` before the handler runs.
 *
 * - On a method (endpoint level): applies to just that method.
 * - On a class (controller level): applies to every method on it, merged
 *   with whatever each individually adds.
 *
 * @example
 * ```ts
 * class UserController {
 *   @LogAllowList({ id: true, email: true })
 *   async getUser(id: string) { ... }
 * }
 * ```
 */
export function LogAllowList(shape: LogAllowShape): MethodDecorator & ClassDecorator {
  return SetMetadata(ALLOW_LIST_METADATA_KEY, shape)
}
