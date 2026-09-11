/**
 * One executed test case's outcome, as rendered into the report.
 */
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
/**
 * Aggregate counts and total duration across every executed test case.
 */
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
 * Render model-facing command results with the same standalone Observatory UI as /test.
 * @param title - report and project title.
 * @param summary - aggregate command counts.
 * @param results - command outcomes in execution order.
 * @returns one self-contained HTML document.
 */
export declare function renderReport(title: string, summary: TestRunSummary, results: readonly TestCaseResult[]): string;
