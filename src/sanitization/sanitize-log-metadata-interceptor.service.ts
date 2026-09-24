import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Response } from 'express'
import { Observable } from 'rxjs'

import { mergeAllowShapes } from './allow-list.util'
import {
  ALLOW_LIST_METADATA_KEY,
  REDACT_METADATA_KEY,
} from './sanitize-metadata.keys'
import { LogAllowShape } from './types/allow-list.types'
import { SanitizeLogMetadata } from './types/redaction.types'

/**
 * Resolves this handler's effective `@LogAllowList`/`@LogRedact` config (merging
 * controller + endpoint level, same as before) and writes it to
 * `response.locals.sanitizeMetadata` *before* the handler runs.
 *
 * Unlike the previous wrap-and-stash-on-the-return-value mechanism, this
 * doesn't care how the handler ends: `res.json`, `res.send`, `res.redirect`,
 * or a thrown error all see the same `response.locals`, since it's a
 * property of the one response object that outlives all of them - there's
 * no return value to lose metadata off in the first place.
 *
 * Registered globally by `LogSanitizationModule.forRoot()`, so no separate
 * `@UseInterceptors()` wiring is needed on top of what's already required.
 */
@Injectable()
export class SanitizeLogMetadataInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (context.getType() === 'http') {
      const metadata = this.resolveMetadata(context)
      if (metadata !== undefined) {
        const response = context.switchToHttp().getResponse<Response>()
        response.locals.sanitizeMetadata = metadata
      }
    }
    return next.handle()
  }

  private resolveMetadata(
    context: ExecutionContext,
  ): SanitizeLogMetadata | undefined {
    const targets = [context.getHandler(), context.getClass()]

    const allowShape = this.reflector
      .getAll<(LogAllowShape | undefined)[]>(ALLOW_LIST_METADATA_KEY, targets)
      .filter((shape): shape is LogAllowShape => shape !== undefined)
      .reduce<LogAllowShape | undefined>(
        (merged, shape) =>
          merged === undefined ? shape : mergeAllowShapes(merged, shape),
        undefined,
      )

    const redactorNames: readonly string[] = this.reflector
      .getAll<(readonly string[] | undefined)[]>(REDACT_METADATA_KEY, targets)
      .filter((names): names is readonly string[] => names !== undefined)
      .flat()

    if (allowShape === undefined && redactorNames.length === 0) {
      return undefined
    }
    return { allowShape, redactorNames }
  }
}
