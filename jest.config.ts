/** @jest-config-loader ts-node */
// ts-node loads this TypeScript config; Jest's config loader does not reliably
// pick up native Node.js type-stripping.

import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // load reflect-metadata so emitted decorator metadata behaves as it does at runtime
  setupFiles: ['reflect-metadata'],
}

export default config
