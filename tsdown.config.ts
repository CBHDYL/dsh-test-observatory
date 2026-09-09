import { defineConfig } from 'tsdown'

/**
 * Build the entry points one package ships: the two plugin modules the profile
 * patch mounts, and the report and experience APIs they are built from.
 */
export default defineConfig({
  entry: [
    'lib/types/index.js',
    'lib/types/command/index.js',
    'lib/types/tool/index.js',
    'lib/types/report/index.js',
    'lib/types/experience/index.js',
  ],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: ['lib/*.js'],
})