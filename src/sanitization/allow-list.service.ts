import { Injectable } from '@nestjs/common'

import {
  AllowShape,
  filterByShape,
  mergeAllowShapes,
} from './types/allow-list.types'

@Injectable()
// eslint-disable-next-line @darraghor/nestjs-typed/injectable-should-be-provided
export class AllowListService {
  /**
   * App-wide default, set via `SanitizationModule.forRoot()`. Defaults to
   * `{}` (deny by default: nothing is logged until something allows it).
   */
  private globalShape: AllowShape = {}

  setGlobalShape(shape: AllowShape): void {
    this.globalShape = shape
  }

  filter(routeShape: AllowShape | undefined, value: unknown): unknown {
    return filterByShape(
      routeShape
        ? mergeAllowShapes(this.globalShape, routeShape)
        : this.globalShape,
      value,
    )
  }
}
