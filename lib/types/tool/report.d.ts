/**
 * Pure HTML5 rendering of a test-run report: escaping, the summary section,
 * and the per-test collapsible detail rows. No I/O, no Cordis, no clock/random
 * — this module is unit-tested directly, in isolation from the tool plugin.
 * @module @deepseek-ai/dsh-tool-test-runner/report
 */
/** One executed test case's outcome, as rendered into the report. */
export interface TestCaseResult {
    /** Test case name/description. */
    readonly name: string;
    /** The shell command that was run. */
    readonly command: string;
    /** Process exit code, or `null` when the process was killed by a signal or aborted before exit. */
    readonly exitCode: number | null;
    /** The exit code the test case expected to pass. */
    readonly expectedExitCode: number;
    /** Whether `exitCode === expectedExitCode`. */
    readonly passed: boolean;
    /** Wall-clock duration of the test case, in milliseconds. */
    readonly durationMs: number;
    /** Captured stdout, truncated to a bounded size with a trailing marker. */
    readonly stdout: string;
    /** Captured stderr, truncated to a bounded size with a trailing marker. */
    readonly stderr: string;
}
/** Aggregate counts and total duration across every executed test case. */
export interface TestRunSummary {
    /** Total number of test cases executed. */
    readonly total: number;
    /** Number of test cases whose exit code matched their expectation. */
    readonly passed: number;
    /** Number of test cases whose exit code did not match their expectation. */
    readonly failed: number;
    /** Sum of every test case's `durationMs`. */
    readonly durationMs: number;
}
/**
 * Escape the five HTML-significant characters so interpolated user-controlled
 * strings (names, commands, stdout, stderr, title) cannot inject markup.
 * @param value - raw string that may contain `< > & " '`.
 * @returns the string with each significant character replaced by its entity.
 */
export declare function escapeHtml(value: string): string;
/**
 * Render a complete, self-contained HTML5 test report: a summary section
 * (total/passed/failed/duration) followed by one expandable row per test
 * case. Every interpolated string (title, names, commands, stdout, stderr) is
 * escaped against HTML injection; the stylesheet is inline and no external
 * resource is referenced.
 * @param title - report title, shown as the page heading.
 * @param summary - aggregate counts and total duration.
 * @param results - per-test-case outcomes, rendered in execution order.
 * @returns a complete HTML document as a string.
 */
export declare function renderReport(title: string, summary: TestRunSummary, results: readonly TestCaseResult[]): string;
