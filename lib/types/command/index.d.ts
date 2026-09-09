/**
 * Human-facing `/test` command: execute a declared command suite and write a
 * Test Observatory HTML report. The command is the human entry point; the
 * report renderer owns the document, and this package owns configuration
 * loading, execution and where the file lands.
 * @module @deepseek-ai/dsh-command-test
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "command-test";
export declare const inject: string[];
/**
 * Register the `/test` command.
 * @param ctx - context carrying the command registry.
 */
export declare function apply(ctx: Context): void;
