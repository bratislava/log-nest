import 'reflect-metadata'

import { Get } from '@nestjs/common'
import { PATH_METADATA } from '@nestjs/common/constants'

import { AllowList } from '../allow-list.decorator'
import { Redact } from '../redact.decorator'

const routeOf = (ctor: new () => unknown, key: string): unknown => {
  const proto = ctor.prototype as Record<string, object>
  // eslint-disable-next-line security/detect-object-injection
  return Reflect.getMetadata(PATH_METADATA, proto[key])
}

// @AllowList/@Redact now attach via SetMetadata, which never touches
// descriptor.value, so there's no method reference to lose route metadata
// off in the first place - but this regression is cheap enough to keep an
// explicit guard for.
describe('route metadata survives the sanitize decorators', () => {
  it('class-level @AllowList keeps every method’s route metadata reachable', () => {
    @AllowList({ id: true })
    class Ctrl {
      @Get('ping')
      ping(): string {
        return 'pong'
      }

      @Get('pong')
      pong(): string {
        return 'ping'
      }
    }

    expect(routeOf(Ctrl, 'ping')).toBe('ping')
    expect(routeOf(Ctrl, 'pong')).toBe('pong')
  })

  it('method-level @AllowList above the route decorator keeps its metadata', () => {
    class Ctrl {
      @AllowList({ id: true })
      @Get('ping')
      ping(): string {
        return 'pong'
      }
    }

    expect(routeOf(Ctrl, 'ping')).toBe('ping')
  })

  it('method-level @Redact above the route decorator keeps its metadata', () => {
    class Ctrl {
      @Redact('email')
      @Get('ping')
      ping(): string {
        return 'pong'
      }
    }

    expect(routeOf(Ctrl, 'ping')).toBe('ping')
  })

  it('@Redact below the route decorator also keeps its metadata', () => {
    class Ctrl {
      @Get('ping')
      @Redact('email')
      ping(): string {
        return 'pong'
      }
    }

    expect(routeOf(Ctrl, 'ping')).toBe('ping')
  })
})
