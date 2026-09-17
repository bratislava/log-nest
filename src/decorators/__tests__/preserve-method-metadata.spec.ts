import 'reflect-metadata'

import { Get } from '@nestjs/common'
import { PATH_METADATA } from '@nestjs/common/constants'

import { AllowList } from '../allow-list.decorator'
import { Redact } from '../redact.decorator'
import { preserveMethodMetadata } from '../utils/preserve-method-metadata'

const routeOf = (ctor: new () => unknown, key: string): unknown => {
  const proto = ctor.prototype as Record<string, object>
  // eslint-disable-next-line security/detect-object-injection
  return Reflect.getMetadata(PATH_METADATA, proto[key])
}

describe('preserveMethodMetadata', () => {
  it('copies own reflect-metadata from one function onto another', () => {
    const original = (): string => 'original'
    const wrapper = (): string => 'wrapper'
    Reflect.defineMetadata(PATH_METADATA, 'ping', original)
    Reflect.defineMetadata('test:other', 42, original)

    preserveMethodMetadata(original, wrapper)

    expect(Reflect.getMetadata(PATH_METADATA, wrapper)).toBe('ping')
    expect(Reflect.getMetadata('test:other', wrapper)).toBe(42)
  })
})

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
