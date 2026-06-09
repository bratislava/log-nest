<p align="center">
  <img src="assets/log-nest-logo-251x256.png" alt="log-nest" width="128" />
</p>

<h1 align="center">log-nest</h1>

<p align="center"><i>/lɒx nɛs/</i></p>

[![npm](https://img.shields.io/npm/v/@bratislava/log-nest)](https://www.npmjs.com/package/@bratislava/log-nest)

Shared NestJS logging and error-handling infrastructure. Made to be used by the
NestJS applications of the city of [Bratislava](https://github.com/bratislava).

## Installation

`npm i @bratislava/log-nest`

## Using the library

TODO

## Exports

| Export | Kind | Purpose |
| --- | --- | --- |
| `NestLoggingModule` | module | `forRoot({ alertReporting })`; provides + globally exports the guard |
| `ThrowerErrorGuard<T>` | injectable | exception factory, generic over the enum union |
| `LineLoggerSubservice` | class | logfmt `LoggerService` |
| `ErrorFilter`, `HttpExceptionFilter` | filters | global exception handling |
| `AppLoggerMiddleware` | middleware | request/response logging + log/response split |
| `ErrorsEnum`, `ErrorsResponseEnum` | enums | shared base error codes + messages |
| `toLogfmt`, `errorToLogfmt`, `escapeForLogfmt` | functions | logfmt helpers |
| `HandleErrors`, `CatchDatabaseError`, `IHasThrowerErrorGuard` | decorators / type | error-handling decorators |

## Developing and running tests

TODO

## License

[EUPL-1.2](./LICENSE.md)
