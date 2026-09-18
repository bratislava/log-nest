import { HttpException } from '@nestjs/common'

import { ErrorFactoryService } from '../error-factory.service'

describe('ErrorFactoryService error-enum registry', () => {
  it('a bare ErrorFactoryService() defaults to string when nothing is registered', () => {
    const errorFactoryService = new ErrorFactoryService()
    const exception = errorFactoryService.BadRequestException({
      errorEnum: 'anything',
      message: 'bad input',
    })

    expect(exception).toBeInstanceOf(HttpException)
    expect(exception.getStatus()).toBe(400)
  })

  it('an explicit generic still overrides the default (backward compatible)', () => {
    const errorFactoryService = new ErrorFactoryService<'A' | 'B'>()

    const exception = errorFactoryService.BadRequestException({
      errorEnum: 'A',
      message: 'ok',
    })

    errorFactoryService.BadRequestException({
      // @ts-expect-error -- 'C' isn't part of this explicit <'A' | 'B'> override
      errorEnum: 'C',
      message: 'should not type-check',
    })

    expect(exception.getStatus()).toBe(400)
  })
})
