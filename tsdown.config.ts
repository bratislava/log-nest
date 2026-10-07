import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/testing/index.ts'],
  unbundle: true,
  fixedExtension: false,
  tsconfig: 'tsconfig.build.json',
  dts: true,
  deps: {
    neverBundle: true,
  },
  publint: true,
  attw: { profile: 'esm-only' },
})
