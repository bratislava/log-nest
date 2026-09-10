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
- `ErrorFactoryService` builds exceptions that carry structured metadata: a machine-readable `errorName` for querying,
  an
  `alert` flag for Grafana alerting, and log-only context the client must never see.
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
raise a Grafana alert when thrown (`ErrorEnum.BAD_GATEWAY_AUTH_ERROR` should always be on it). Keep the list in a
separate file, it doubles as the app's single overview of which errors alert:

```ts
// alert-reporting.ts
import { ErrorEnum } from '@bratislava/log-nest'

export const alertReporting: readonly string[] = [
  ErrorEnum.BAD_GATEWAY_AUTH_ERROR,
  ErrorEnum.DATABASE_ERROR,
  // ...whatever else should page you
]
```

```ts
// app.module.ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import {
  AppLoggerMiddleware,
  NestLoggingModule,
  SanitizationModule,
} from '@bratislava/log-nest'

import { alertReporting } from './alert-reporting'

@Module({
  imports: [
    NestLoggingModule.forRoot({ alertReporting }),
    SanitizationModule.forRoot(), // registers redactors + the allowlist for @Redact/@AllowList
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AppLoggerMiddleware).forRoutes('*')
  }
}
```

`AppLoggerMiddleware` depends on both `RedactionService` and `AllowListService`, so
`SanitizationModule.forRoot()` must be imported even if you don't configure any redactors or
allowlist yet — omit its options and nothing is filtered, matching today's behavior.

Then wire the logger and the global exception filters in `main.ts`:

```ts
// main.ts
import { NestFactory } from '@nestjs/core'
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

### Throwing errors: `ErrorFactoryService`

`NestLoggingModule` provides and globally exports `ErrorFactoryService`, so it can be injected anywhere without
re-importing. Each factory method takes an `options` object and *returns* an `HttpException`.

```ts

@Injectable()
export class FormsService {
  constructor(private readonly errorFactoryService: ErrorFactoryService) {
  }

  async getForm(id: string): Promise<Form> {
    const form = await this.repository.find(id)
    if (!form) {
      throw this.errorFactoryService.NotFoundException({
        errorEnum: ErrorEnum.NOT_FOUND_ERROR,
        message: 'Form not found.', // sent to the client
        console: { formId: id },    // logged only, stripped from the response
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
- `ErrorResponseEnum` holds a default client-facing message for every base error code, so the common idiom is pairing
  the two: `errorEnum: ErrorEnum.NOT_FOUND_ERROR, message: ErrorResponseEnum.NOT_FOUND_ERROR`.

**App-specific error enums.** The error factory service is generic over the enum union, so extend the base `ErrorEnum`
with your own and keep type safety:

```ts
enum UserErrorEnum {
  USER_NOT_VERIFIED = 'USER_NOT_VERIFIED',
}

type AppErrorEnums = ErrorEnum | UserErrorEnum

@Injectable()
export class UserService {
  constructor(
    private readonly errorFactoryService: ErrorFactoryService<AppErrorEnums>,
  ) {
  }

  verify(user: User): void {
    if (!user.verified) {
      throw this.errorFactoryService.ForbiddenException({
        errorEnum: UserErrorEnum.USER_NOT_VERIFIED,
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
    throw this.errorFactoryService.fromAxiosError(error, {
      message: 'Document service request failed.',
      console: { documentId: id },
      statusOverrides: {
        // downstream 404 -> our 404 instead of the default 502
        404: {
          status: 404,
          errorEnum: ErrorEnum.NOT_FOUND_ERROR,
          message: 'Document not found.',
        },
      },
    })
  }
  // handle other error types here
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
    this.logger.log('Form created', { formId: form.id, slug: form.slug })
    // process="[Nest]" processPID="42" datetime="…" severity="LOG" 
    // context="FormsService" message="Form created" formId="…" slug="…"
  }
}
```

Strings already in logfmt shape pass through untouched; everything else is serialized with the logfmt helpers, which are
also exported for direct use:
`toLogfmt(value)`, `errorToLogfmt(error)`, and `escapeForLogfmt(string)`.

**Auto-named via DI.** Instead of passing `ClassName.name` yourself, inject `LineLoggerSubservice` as a constructor
dependency of any `@Injectable()` class and it derives its context from that class automatically:

```ts
@Injectable()
export class FormsService {
  constructor(private readonly logger: LineLoggerSubservice) {
  }

  create(form: Form): void {
    this.logger.log('Form created', {formId: form.id}) // context="FormsService"
  }
}
```

This only works when Nest constructs the class through its own DI container — a class built manually via a custom
`useFactory` provider won't get a meaningful context this way, so keep using `new LineLoggerSubservice(ClassName.name)`
there.

Two details worth knowing:

- The second constructor parameter disables ANSI colors: `new LineLoggerSubservice(context, false)`. By default every
  line is wrapped in color escape codes.
- When serializing an object, the `console` field is flattened: its sub-fields become top-level logfmt pairs on the
  line, so name them as you want to query them in Loki.

### Request logging: `AppLoggerMiddleware`

The middleware is a **mandatory** part of the setup, not an optional logging add-on. The exception filters deliberately
never send a response themselves. The middleware's send-hook is what strips the log-only metadata from the error body.
On a route without the middleware, an error therefore produces no response at all and the client waits until timeout.
Register it on every route, as shown in [Quick start](#quick-start).

The middleware emits one logfmt line per handled request, containing
`method`, `originalUrl`, `statusCode`, `responseTime` (ms), `userAgent`, `ip`, `userId`, the JSON-serialized
`request-body`, and the `response-data`. The line's severity is what makes alerting work:

| Condition                       | Severity |
|---------------------------------|----------|
| `statusCode` ≥ 500 or `alert=1` | `error`  |
| `statusCode` ≥ 400              | `warn`   |
| otherwise                       | `log`    |

**The log/response split.** On errors, the client gets the sanitized response (`statusCode`, `status`, `errorName`,
`message`) while the log-only metadata (`alert`, `console`, cause chain, stack) ends up on the log line. This is how
`console` and `error` from [`ErrorFactoryService`](#throwing-errors-errorfactoryservice) stay log-only.

> [!WARNING]
> By default the **entire request/response body is logged verbatim**. Use `@AllowList(...)` (below) and/or
> `SanitizationModule.forRoot({allowShape})` to restrict what ends up in `request-body`/`response-data` before
> sending secrets or sensitive personal data to endpoints logged by this middleware.

Also note that `userId` is best-effort: the JWT payload from the `Authorization` header is decoded **without signature
verification**, purely for log correlation. Never treat it as authenticated.

### Filtering logged data: `@AllowList`

`@AllowList(shape)` restricts which keys of `request-body`/`response-data` `AppLoggerMiddleware` is allowed to log,
on top of the app-wide default from `SanitizationModule.forRoot({allowShape})`. A shape is a tree: `true` keeps a whole
subtree as-is, and a nested object recurses key-by-key — anything not mentioned is dropped. Each level only ever
**widens** what's allowed; an endpoint or controller can't narrow the app-wide default below what it already allows.

```ts
@Controller('users')
@AllowList({id: true}) // controller level: every endpoint here may at least log `id`
export class UserController {
  @Get(':id')
  @AllowList({email: true}) // endpoint level: adds `email` on top of the controller's `id`
  async getUser(@Param('id') id: string): Promise<User> {
    return this.userService.findById(id)
    // logged response-data: { id, email } — every other field is dropped
  }
}
```

`@AllowList` works on both methods (endpoint level) and classes (controller level, applied to every method on the
class). It uses the same wrap-and-stash mechanism as [`@Redact`](#redacting-logged-data-redact) — no
`Reflector`/`ExecutionContext` involved, since `AppLoggerMiddleware` is plain middleware and has none to read from.

### Redacting logged data: `@Redact`

Where `@AllowList` is *structural* (which keys survive at all), `@Redact` is *content-based*: it masks matching
patterns (emails, IDs, ...) inside whatever `@AllowList` leaves behind, on the resulting value's string leaves.
Register named redactors once via `SanitizationModule.forRoot({redactors})`, then reference them by name:

```ts
// redactors.ts
import {Redactor} from '@bratislava/log-nest'

export const emailRedactor: Redactor = {
  name: 'email',
  redact: (line) => line.replaceAll(/[\w.-]+@[\w.-]+/g, '[REDACTED:email]'),
}
```

```ts
// app.module.ts
SanitizationModule.forRoot({redactors: [emailRedactor]}) // global: applied to every request/response
```

```ts
@Controller('users')
export class UserController {
  @Get(':id')
  @Redact('email') // extra, endpoint-specific redactor on top of the global set, by name
  async getUser(@Param('id') id: string): Promise<User> {
    return this.userService.findById(id)
  }
}
```

Like `@AllowList`, it works via the same wrap-and-stash mechanism, is additive across the global/endpoint levels,
and runs independently of allowlist filtering — allowlist decides *which keys* are logged, redaction decides
*what's left visible inside them*.

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
`ErrorEnum.DATABASE_ERROR`, keeping the original error as the logged cause. The class must expose the error factory
service as
`errorFactoryService` (enforced by the `IHasErrorFactoryService` interface):

```ts

@Injectable()
export class FormRepository implements IHasErrorFactoryService {
  constructor(public readonly errorFactoryService: ErrorFactoryService) {
  }

  @CatchDatabaseError()
  async findForm(id: string): Promise<Form> {
    return this.prisma.form.findUniqueOrThrow({ where: { id } })
  }
}
```

## Exports

| Export                                                          | Kind              | Purpose                                                                                |
|------------------------------------------------------------------|-------------------|-----------------------------------------------------------------------------------------|
| `NestLoggingModule`                                             | module            | `forRoot({ alertReporting })`; provides + globally exports the error factory service   |
| `ErrorFactoryService<T>`                                        | injectable        | exception factory, generic over the enum union                                         |
| `LineLoggerSubservice`                                          | class             | logfmt `LoggerService`                                                                 |
| `ErrorFilter`, `HttpExceptionFilter`                            | filters           | global exception handling                                                              |
| `AppLoggerMiddleware`                                           | middleware        | request/response logging + log/response split                                          |
| `SanitizationModule`                                            | module            | `forRoot({ redactors, allowShape })`; provides + globally exports both services below   |
| `RedactionService`, `Redactor`                                  | class / type      | content-based redaction, by name                                                       |
| `AllowListService`, `AllowShape`                                | class / type      | structural key filtering for logged data                                               |
| `ErrorEnum`, `ErrorResponseEnum`                                | enums             | shared base error codes + messages                                                     |
| `toLogfmt`, `errorToLogfmt`, `escapeForLogfmt`                  | functions         | logfmt helpers                                                                         |
| `HandleErrors`, `CatchDatabaseError`, `IHasErrorFactoryService` | decorators / type | error-handling decorators                                                              |
| `Redact`, `AllowList`                                           | decorators        | per-route redaction / allowlist filtering, additive over the global config             |

## Developing and running tests

Requires node 24 (see `engines` in `package.json`; [volta](https://volta.sh/) picks it up automatically). Then:

```sh
npm ci             # install dependencies
npm run build      # compile to dist/ (tsconfig.build.json)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint (lint:fix to autofix, format for prettier)
npm test           # jest (test:watch for watch mode)
```

## License

[EUPL-1.2](./LICENSE.md)
