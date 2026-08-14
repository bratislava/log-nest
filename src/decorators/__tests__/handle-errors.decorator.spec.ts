import { ErrorEnum } from '../../errors/base-errors.enum'
import { ErrorFactory } from '../../errors/error-factory.service'
import { HandleErrors } from '../handle-errors.decorator'

describe('HandleErrors', () => {
  let consoleErrorMock: jest.SpyInstance

  beforeEach(() => {
    consoleErrorMock = jest.spyOn(console, 'log').mockImplementation(jest.fn())
  })

  afterEach(() => {
    consoleErrorMock.mockRestore()
  })

  it('should catch and handle errors', async () => {
    class TestClass {
      @HandleErrors('Test error handler')
      async testMethod(): Promise<void> {
        return Promise.reject(new Error('This is a test error'))
      }
    }

    const t = new TestClass()

    // We expect testMethod to throw an error which should be caught and handled by the decorator
    await expect(t.testMethod()).resolves.toBeNull()

    const regex =
      /process="\[Nest]" processPID="\d+" datetime="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z" severity="ERROR" context="Test error handler" errorType="Error" message="This is a test error" method="undefined" stack="Error: This is a test error.*"/

    expect(consoleErrorMock).toHaveBeenCalledTimes(1)
    expect(consoleErrorMock).toHaveBeenCalledWith(expect.stringMatching(regex))
  })

  it('should catch and handle HttpExceptions', async () => {
    class TestClass {
      private errorFactory = new ErrorFactory({
        alertReporting: [ErrorEnum.INTERNAL_SERVER_ERROR],
      })

      @HandleErrors('Test error handler')
      async testMethod(): Promise<void> {
        return Promise.reject(
          this.errorFactory.BadRequestException({
            errorEnum: ErrorEnum.INTERNAL_SERVER_ERROR,
            message: 'Error message',
            console: 'Console error',
            error: new Error('Caused by error message test'),
          }),
        )
      }
    }

    const t = new TestClass()

    // We expect testMethod to throw an error which should be caught and handled by the decorator
    await expect(t.testMethod()).resolves.toBeNull()

    const regex =
      /process="\[Nest]" processPID="\d+" datetime="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z" severity="ERROR" context="Test error handler" errorType="HttpException" statusCode="400" status="Bad Request" errorName="INTERNAL_SERVER_ERROR" message="Error message" alert="1" errorCause="Error" causedByMessage="Caused by error message test" causedByConsole="undefined" console="Console error" method="undefined" stack="HttpException:.*Was directly caused by:.*/

    expect(consoleErrorMock).toHaveBeenCalledTimes(1)
    expect(consoleErrorMock).toHaveBeenCalledWith(expect.stringMatching(regex))
  })
})
