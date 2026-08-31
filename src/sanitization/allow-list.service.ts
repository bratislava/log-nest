import { Injectable } from '@nestjs/common'
import {
  AllowShape,
  filterByShape,
  mergeAllowShapesInternal,
} from './types/allow-list.types'


@Injectable()
export class AllowListService {
  /** App-wide default, set via `SanitizationModule.forRoot()`. `true` = no filtering. */
  private globalShape: AllowShape = true

  setGlobalShape(shape: AllowShape): void {
    this.globalShape = shape
  }

  filter(routeShape: AllowShape | undefined, value: unknown): unknown {
    return filterByShape(mergeAllowShapesInternal(this.globalShape, routeShape), value)
  }
}
