/**
 * A node in an allowlist shape tree: `true` allows the whole subtree at that
 * point (no further filtering, keeps whatever it is), and a nested object
 * recurses key-by-key. A key absent from the shape is dropped, whatever the
 * value at that key actually is.
 */
export type LogAllowShape = true | { [key: string]: LogAllowShape }
