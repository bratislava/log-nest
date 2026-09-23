/**
 * Declaration-merge this to register your app's error-enum union once, so
 * `ErrorFactoryService` injected with no generic is typed with it
 * everywhere:
 *
 * ```ts
 * declare module '@bratislava/log-nest' {
 *   interface LogNestErrorEnumRegistry {
 *     errorEnum: AppErrorEnums
 *   }
 * }
 * ```
 *
 * Deliberately empty by default: TypeScript requires a property declared in
 * more than one merged interface to have the *same* type everywhere, so a
 * default like `{ errorEnum: string }` here could never be narrowed by an
 * app's augmentation. Leaving it unset lets `error-factory.service.ts`
 * detect "not registered" and fall back to plain `string` until an app's
 * `declare module` adds `errorEnum`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentionally empty for declaration merging, see doc comment above
export interface LogNestErrorEnumRegistry {}
