import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Per-file `@vitest-environment` pragmas select jsdom where a spec needs a DOM;
    // this project default is the Node environment every other spec expects.
    environment: 'node',
  },
})
