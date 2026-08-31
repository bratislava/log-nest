import { LineLoggerSubservice } from '../line-logger.subservice'

describe('LineLoggerService', () => {
  let service: LineLoggerSubservice
  let consoleSpy: jest.SpyInstance

  beforeEach(() => {
    service = new LineLoggerSubservice('LineLogger TEST')
    consoleSpy = jest.spyOn(console, 'log')
    consoleSpy.mockImplementation(jest.fn())
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  test.each<
    [
      keyof Pick<
        LineLoggerSubservice,
        'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal'
      >,
      string,
    ]
  >([
    ['log', 'LOG'],
    ['error', 'ERROR'],
    ['warn', 'WARN'],
    ['debug', 'DEBUG'],
    ['verbose', 'VERBOSE'],
    ['fatal', 'FATAL'],
  ])('should print %s message with severity %s', (method, severity) => {
    // eslint-disable-next-line security/detect-object-injection
    service[method]('test message')

    // eslint-disable-next-line security/detect-non-literal-regexp
    const regex = new RegExp(
      `process="\\[Nest]" processPID="\\d+" datetime="\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.\\d{3}Z" severity="${severity}" context="LineLogger TEST" message="test message"`,
    )

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(regex))
    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })

  it('should print log message with object as message', () => {
    service.log({ foo: 'string' })

    const regex =
      /process="\[Nest]" processPID="\d+" datetime="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z" severity="LOG" context="LineLogger TEST" foo="string"/

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(regex))
    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })
})
