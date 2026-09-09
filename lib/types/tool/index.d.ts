/**
 * Model-facing generic test executor: runs a list of shell-command test
 * cases sequentially and writes a self-contained HTML report to disk. Each
 * test case's own exit code encodes pass/fail — this tool provides no
 * built-in assertion library. Self-contained: subprocess execution goes
 * directly through node:child_process rather than a shell capability seam,
 * mirroring how dsh-tool-fs uses node:fs directly.
 * @module @deepseek-ai/dsh-tool-test-runner
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "tool-test-runner";
export declare const inject: string[];
/**
 * Register the `run_tests` tool on `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry.
 */
export declare function apply(ctx: Context): void;
