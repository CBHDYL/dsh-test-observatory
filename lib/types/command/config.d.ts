/**
 * Suite-configuration loading and validation. The configuration is an external
 * input (a file a human wrote), so every field is validated here rather than
 * trusted: a malformed document fails with a message naming the exact problem.
 * @module @deepseek-ai/dsh-command-test/config
 */
import type { SuiteConfig } from './types.ts';
/** A configuration problem a human must fix; never an internal failure. */
export declare class SuiteConfigError extends Error {
    /**
     * @param message - the exact problem, naming the offending field.
     */
    constructor(message: string);
}
/**
 * Parse and validate a suite configuration document.
 * @param text - the YAML document text.
 * @returns the validated configuration.
 */
export declare function parseSuiteConfig(text: string): SuiteConfig;
/**
 * Read and validate a suite configuration file.
 * @param path - absolute or relative path of the configuration file.
 * @returns the validated configuration.
 */
export declare function loadSuiteConfig(path: string): Promise<SuiteConfig>;
