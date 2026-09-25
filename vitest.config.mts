import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // load reflect-metadata so emitted decorator metadata behaves as it does at runtime
    setupFiles: ['reflect-metadata', 'src/__tests__/logs.ts'],
    // hide console output from passing tests, keep it for failing ones
    silent: 'passed-only',
  },
})
