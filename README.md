<p align="center">
  <img src="assets/log-nest-logo-251x256.png" alt="log-nest" width="128" />
</p>

<h1 align="center">log-nest</h1>

<p align="center"><i>/lɒx nɛs/</i></p>

[![npm](https://img.shields.io/npm/v/@bratislava/log-nest)](https://www.npmjs.com/package/@bratislava/log-nest)

Shared NestJS logging and error-handling infrastructure. Made to be used by the NestJS applications of the city
of [Bratislava](https://github.com/bratislava).

## Motivation

Our backends log to [Grafana Loki](https://grafana.com/oss/loki/), and multi-line output (stack traces, pretty-printed
JSON) breaks up into separate, unrelated log entries there. So the core rule of this package is: **one event = one
line** of space-separated `key="value"` pairs ([logfmt](https://brandur.org/logfmt)), which Loki parses into queryable
labels.

Everything else follows from that:

- `LineLoggerSubservice` formats every log call, including stack traces, as a single logfmt line.
- `ThrowerErrorGuard` builds exceptions that carry structured metadata: a machine-readable `errorName` for querying,
  an `alert` flag for Grafana alerting, and log-only context the client must never see.
- The exception filters and `AppLoggerMiddleware` cooperate to split each error into its two audiences: the sanitized
  JSON response goes to the client, while the full picture (cause chain, `console` context, stack) goes to the log.
- Code running outside the request-handling chain (cron jobs, startup tasks, event handlers) is covered too: the
  `@HandleErrors` decorator logs errors the exception filters would never see, and registering `LineLoggerSubservice`
  as the NestJS logger keeps the framework's own output logfmt as well.

## Installation

`npm i @bratislava/log-nest`

## Using the library

### Quick start

Register the module once at the app root. `alertReporting` is the app-specific list of error-enum values that should
raise a Grafana alert when thrown (`ErrorsEnum.BAD_GATEWAY_AUTH_ERROR` should always be on it). Keep the list in a
separate file, it doubles as the app's single overview of which errors alert:

```ts
// alert-reporting.ts
import {ErrorsEnum} from '@bratislava/log-nest'

export const alertReporting: readonly string[] = [
  ErrorsEnum.BAD_GATEWAY_AUTH_ERROR,
  ErrorsEnum.DATABASE_ERROR,
  // ...whatever else should page you
]
```

```ts
// app.module.ts
import {MiddlewareConsumer, Module, NestModule} from '@nestjs/common'
import {AppLoggerMiddleware, NestLoggingModule} from '@bratislava/log-nest'

import {alertReporting} from './alert-reporting'

@Module({
  imports: [NestLoggingModule.forRoot({alertReporting})],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AppLoggerMiddleware).forRoutes('*')
  }
}
```

Then wire the logger and the global exception filters in `main.ts`:

```ts
// main.ts
import {NestFactory} from '@nestjs/core'
import {
  ErrorFilter,
  HttpExceptionFilter,
  LineLoggerSubservice,
} from '@bratislava/log-nest'

const app = await NestFactory.create(AppModule, {
  logger: new LineLoggerSubservice(),
})
// Order matters: later filters take precedence, and HttpException extends 
// Error. Swap these and ErrorFilter would swallow HttpExceptions too.
app.useGlobalFilters(new ErrorFilter(), new HttpExceptionFilter())
await app.listen(3000)
```

That's the whole setup. See [Motivation](#motivation) for how the pieces cooperate.

### Throwing errors: `ThrowerErrorGuard`

`NestLoggingModule` provides and globally exports `ThrowerErrorGuard`, so it can be injected anywhere without
re-importing. Each factory method takes an `options` object and *returns* an `HttpException`.

```ts

@Injectable()
export class FormsService {
  constructor(private readonly throwerErrorGuard: ThrowerErrorGuard) {
  }

  async getForm(id: string): Promise<Form> {
    const form = await this.repository.find(id)
    if (!form) {
      throw this.throwerErrorGuard.NotFoundException({
        errorEnum: ErrorsEnum.NOT_FOUND_ERROR,
        message: 'Form not found.', // sent to the client
        console: {formId: id},    // logged only, stripped from the response
      })
    }
    return form
  }
}
```

- `errorEnum` is stored as `errorName` on the exception and drives alerting: if it is listed in `alertReporting`, the
  produced log line carries `alert=1`.
- `console` (a string or object) and the `error` cause are attached to the log entry only. The client never sees them.
  The cause's stack is chained onto the exception's stack.
- `ErrorsResponseEnum` holds a default client-facing message for every base error code, so the common idiom is pairing
  the two: `errorEnum: ErrorsEnum.NOT_FOUND_ERROR, message: ErrorsResponseEnum.NOT_FOUND_ERROR`.

**App-specific error enums.** The guard is generic over the enum union, so extend the base `ErrorsEnum` with your own
and keep type safety:

```ts
enum UserErrorsEnum {
  USER_NOT_VERIFIED = 'USER_NOT_VERIFIED',
}

type AppErrorEnums = ErrorsEnum | UserErrorsEnum

@Injectable()
export class UserService {
  constructor(
    private readonly throwerErrorGuard: ThrowerErrorGuard<AppErrorEnums>,
  ) {
  }

  verify(user: User): void {
    if (!user.verified) {
      throw this.throwerErrorGuard.ForbiddenException({
        errorEnum: UserErrorsEnum.USER_NOT_VERIFIED,
        message: 'User is not verified.',
      })
    }
  }
}
```

**Wrapping downstream (axios) failures.** `fromAxiosError` maps an `AxiosError` to the right exception:

- `503` + `Retry-After` becomes `ServiceUnavailableException`,
- `401`/`403` becomes `BadGatewayException` with `BAD_GATEWAY_AUTH_ERROR` (alert-worthy, see
  [Quick start](#quick-start))
- anything else a plain `BadGatewayException`.

Per-status overrides let you remap specific downstream statuses:

```ts
try {
  await axios.get(`${host}/documents/${id}`)
} catch (error) {
  if (isAxiosError(error)) {
    throw this.throwerErrorGuard.fromAxiosError(error, {
      message: 'Document service request failed.',
      console: {documentId: id},
      statusOverrides: {
        // downstream 404 -> our 404 instead of the default 502
        404: {
          status: 404,
          errorEnum: ErrorsEnum.NOT_FOUND_ERROR,
          message: 'Document not found.',
        },
      },
    })
  }
  throw error
}
```

### Logging: `LineLoggerSubservice`

A standard NestJS `LoggerService`. Besides `app.useLogger`, use it directly with a context label:

```ts

@Injectable()
export class FormsService {
  private readonly logger = new LineLoggerSubservice(FormsService.name)

  create(form: Form): void {
    this.logger.log('Form created', {formId: form.id, slug: form.slug})
    // process="[Nest]" processPID="42" datetime="…" severity="LOG" 
    // context="FormsService" message="Form created" formId="…" slug="…"
  }
}
```

Strings already in logfmt shape pass through untouched; everything else is
serialized with the logfmt helpers, which are also exported for direct use:
`toLogfmt(value)`, `errorToLogfmt(error)`, and `escapeForLogfmt(string)`.

Two details worth knowing:

- The second constructor parameter disables ANSI colors: `new LineLoggerSubservice(context, false)`. By default every
  line is wrapped in color escape codes.
- When serializing an object, the `console` field is flattened: its sub-fields become top-level logfmt pairs on the
  line, so name them as you want to query them in Loki.

### Request logging: `AppLoggerMiddleware`

Registered in [Quick start](#quick-start), the middleware emits one logfmt line per handled request, containing
`method`, `originalUrl`, `statusCode`, `responseTime` (ms), `userAgent`, `ip`, `userId`, the JSON-serialized
`request-body`, and the `response-data`. The line's severity is what makes alerting work:

| Condition                       | Severity |
|---------------------------------|----------|
| `statusCode` ≥ 500 or `alert=1` | `error`  |
| `statusCode` ≥ 400              | `warn`   |
| otherwise                       | `log`    |

**The log/response split.** On errors, the client gets the sanitized response (`statusCode`, `status`, `errorName`,
`message`) while the log-only metadata (`alert`, `console`, cause chain, stack) ends up on the log line. This is how
`console` and `error` from [`ThrowerErrorGuard`](#throwing-errors-throwererrorguard) stay log-only.

Two warnings:

- `userId` is best-effort: the JWT payload from the `Authorization` header is decoded **without signature
  verification**, purely for log correlation. Never treat it as authenticated.
- The **entire request body is logged verbatim**. Until redacting/allowlist filtering lands in this package, do not
  send secrets or sensitive personal data to endpoints logged by this middleware, or exclude those routes from it.

### Decorators

`@HandleErrors(loggerName?)` logs and swallows anything thrown by the method (resolves to `null`). Use it on entry
points that run *outside* the request-handling chain (cron jobs, event handlers, ...). There the exception filters never
see a thrown error, so it would surface as Nest's default multi-line stack trace instead of a logfmt line. The decorator
catches it and logs it through `LineLoggerSubservice`:

```ts

@Injectable()
export class PaymentCronService {
  @HandleErrors('CronJobs')
  async syncPayments(): Promise<void> {
    // any throw here is logged and swallowed
  }
}
```

`@CatchDatabaseError()` remaps anything thrown by the method into an `UnprocessableEntityException` with
`ErrorsEnum.DATABASE_ERROR`, keeping the original error as the logged cause. The class must expose the guard as
`throwerErrorGuard` (enforced by the `IHasThrowerErrorGuard` interface):

```ts
@Injectable()
export class FormRepository implements IHasThrowerErrorGuard {
  constructor(public readonly throwerErrorGuard: ThrowerErrorGuard) {
  }

  @CatchDatabaseError()
  async findForm(id: string): Promise<Form> {
    return this.prisma.form.findUniqueOrThrow({where: {id}})
  }
}
```

## Exports

| Export                                                        | Kind              | Purpose                                                              |
|---------------------------------------------------------------|-------------------|----------------------------------------------------------------------|
| `NestLoggingModule`                                           | module            | `forRoot({ alertReporting })`; provides + globally exports the guard |
| `ThrowerErrorGuard<T>`                                        | injectable        | exception factory, generic over the enum union                       |
| `LineLoggerSubservice`                                        | class             | logfmt `LoggerService`                                               |
| `ErrorFilter`, `HttpExceptionFilter`                          | filters           | global exception handling                                            |
| `AppLoggerMiddleware`                                         | middleware        | request/response logging + log/response split                        |
| `ErrorsEnum`, `ErrorsResponseEnum`                            | enums             | shared base error codes + messages                                   |
| `toLogfmt`, `errorToLogfmt`, `escapeForLogfmt`                | functions         | logfmt helpers                                                       |
| `HandleErrors`, `CatchDatabaseError`, `IHasThrowerErrorGuard` | decorators / type | error-handling decorators                                            |

## Developing and running tests

TODO

## License

[EUPL-1.2](./LICENSE.md)
