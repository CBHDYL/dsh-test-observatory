/** One executed shell command returned by the model-facing tool. */
export interface TestCaseResult {
    readonly name: string;
    readonly command: string;
    readonly exitCode: number | null;
    readonly expectedExitCode: number;
    readonly passed: boolean;
    readonly durationMs: number;
    readonly stdout: string;
    readonly stderr: string;
}
/** Aggregate command counts returned by the model-facing tool. */
export interface TestRunSummary {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
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
