import { Injectable } from '@nestjs/common'

import {
  filterByShape,
  FilterByShapeOptions,
  mergeAllowShapes,
} from './allow-list.util'
import { LogAllowShape } from './types/allow-list.types'

@Injectable()
// eslint-disable-next-line @darraghor/nestjs-typed/injectable-should-be-provided
export class LogAllowListService {
  /**
   * App-wide default, set via `LogSanitizationModule.forRoot()`. Defaults to
   * `{}` (deny by default: nothing is logged until something allows it).
   */
  private globalShape: LogAllowShape = {}

  /**
   * App-wide default, set via `LogSanitizationModule.forRoot()`. Defaults to
   * `'omit'`, dropping disallowed keys/values entirely.
   */
  private onDisallowed: FilterByShapeOptions['onDisallowed'] = 'omit'

  setGlobalShape(shape: LogAllowShape): void {
    this.globalShape = shape
  }

  setOnDisallowed(onDisallowed: FilterByShapeOptions['onDisallowed']): void {
    this.onDisallowed = onDisallowed
  }

  filter(routeShape: LogAllowShape | undefined, value: unknown): unknown {
    return filterByShape(
      routeShape
        ? mergeAllowShapes(this.globalShape, routeShape)
        : this.globalShape,
      value,
      { onDisallowed: this.onDisallowed },
    )
  }
}
