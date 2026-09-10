/**
 * Test Observatory for DeepSeek Harness. The package ships four entry points:
 * the human `/test` command, the model-facing `run_tests` tool, the report
 * renderer, and the experience runner. A profile mounts the first two through
 * `cordis.patch.yml`.
 * @module @cbhdyl/dsh-test-observatory
 */
export * as command from './command/index.ts';
export * as tool from './tool/index.ts';
export * as report from './report/index.ts';
export * as experience from './experience/index.ts';
