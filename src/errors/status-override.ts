/**
 * A single entry for {@link FromAxiosErrorOptions.statusOverrides}, selected by
 * the *downstream* response status (the map key). Note the map key and this
 * `status` are distinct: the key is the downstream status matched against, while
 * `status` is the status the *produced* exception carries — they may differ
 * (e.g. match a downstream `404` but emit a `502`).
 *
 * @property status the HTTP status the produced exception will carry.
 * @property errorEnum stored as `errorName` on the produced exception. Drives
 *        alerting via the injected `alertReporting` list.
 * @property message human-readable text on the exception's `message` field.
 */
export interface StatusOverride<TErrorEnum extends string = string> {
  status: number
  errorEnum: TErrorEnum
  message: string
}

/**
 * Options for `ErrorFactoryService.fromAxiosError`.
 *
 * @property message human-readable text on the produced exception's `message`
 *        field. Applies to all statuses except overridden ones.
 * @property errorEnumOverwrite replaces the default `errorEnum` on the default
 *        branches (`BadGatewayException` / `ServiceUnavailableException`).
 *        Ignored on the statusOverrides path.
 * @property console extra context attached to the log entry only and stripped
 *        from the client response.
 * @property statusOverrides map keyed by the *downstream* response status; the
 *        matched entry supplies the status, errorEnum, and message of the
 *        produced exception (the entry's own `status` may differ from the key).
 *        See {@link StatusOverride}.
 */
export interface FromAxiosErrorOptions<TErrorEnum extends string = string> {
  message?: string
  errorEnumOverwrite?: TErrorEnum
  console?: string | Record<string, unknown>
  statusOverrides?: Record<number, StatusOverride<TErrorEnum>>
}
