/**
 * Suite execution: run every declared case, then build the report model the
 * renderer consumes. The command shell is the only external dependency, so the
 * model construction is a pure function of the settled case outcomes.
 * @module @deepseek-ai/dsh-command-test/runner
 */
import { execFile } from 'node:child_process';
/** Bound on captured output per stream, so one noisy case cannot bloat the report. */
export const MAX_CAPTURED_CHARS = 20000;
/**
 * Truncate captured output with a visible marker.
 * @param value - the captured text.
 * @returns the text, truncated when it exceeds the bound.
 */
export function truncate(value) {
    if (value.length <= MAX_CAPTURED_CHARS)
        return value;
    return value.slice(0, MAX_CAPTURED_CHARS) + '\n… [truncated]';
}
/**
 * Run one declared case and settle it into an outcome. A non-zero exit, a
 * timeout, or a spawn failure are ordinary outcomes, not exceptions: only a
 * caller cancellation rejects.
 * @param testCase - the case to run.
 * @param signal - the invocation's cancellation signal.
 * @param cwd - directory the command runs in; the session's working directory,
 *   so a declared relative command such as `pnpm test` means the project the
 *   suite was written for rather than wherever the host process happens to be.
 * @returns the settled outcome.
 */
export function runCase(testCase, signal, cwd) {
    const expected = testCase.expectedExitCode ?? 0;
    const started = Date.now();
    return new Promise((resolve, reject) => {
        execFile('bash', ['-c', testCase.command], {
            timeout: testCase.timeoutMs,
            maxBuffer: 8 * 1024 * 1024,
            signal,
            ...(cwd === undefined ? {} : { cwd }),
        }, (error, stdout, stderr) => {
            const durationMs = Date.now() - started;
            if (signal.aborted) {
                // Aborting an execFile always settles its callback with an Error.
                reject(error);
                return;
            }
            const code = error?.code;
            const exitCode = typeof code === 'number' ? code : error === null ? 0 : null;
            resolve({
                testCase,
                exitCode,
                passed: exitCode === expected,
                durationMs,
                stdout: truncate(stdout),
                stderr: truncate(stderr),
            });
        });
    });
}
/**
 * Map one outcome to the report status vocabulary.
 * @param outcome - the settled outcome.
 * @returns the report status.
 */
function toStatus(outcome) {
    return outcome.passed ? 'passed' : 'failed';
}
/**
 * Build the report table row for one outcome.
 * @param outcome - the settled outcome.
 * @returns the report row.
 */
function toReportTest(outcome) {
    return {
        name: outcome.testCase.name,
        path: outcome.testCase.command,
        status: toStatus(outcome),
        suite: outcome.testCase.suite ?? 'Suite',
        durationSeconds: Math.round(outcome.durationMs / 10) / 100,
        owner: outcome.testCase.owner ?? 'Unassigned',
        ...(outcome.stdout.length === 0 ? {} : { stdout: outcome.stdout }),
        ...(outcome.stderr.length === 0 ? {} : { stderr: outcome.stderr }),
    };
}
/**
 * Format a duration in seconds as a compact human string.
 * @param seconds - the duration in seconds.
 * @returns the formatted duration.
 */
function formatDuration(seconds) {
    if (seconds < 60)
        return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}
/**
 * Build the report model from settled outcomes.
 * @param outcomes - every settled case outcome, in declaration order.
 * @param inputs - run identity the caller knows.
 * @returns the renderable report model.
 */
export function buildReportModel(outcomes, inputs) {
    const tests = inputs.structuredTests ?? outcomes.map(toReportTest);
    const total = tests.length;
    const passed = tests.filter(test => test.status === 'passed').length;
    const failed = tests.filter(test => test.status === 'failed').length;
    const skipped = tests.filter(test => test.status === 'skipped').length;
    const flaky = tests.filter(test => test.status === 'flaky').length;
    const durationSeconds = Math.round(outcomes.reduce((sum, outcome) => sum + outcome.durationMs, 0) / 10) / 100;
    const passRate = total === 0 ? 0 : Math.round((passed / total) * 1000) / 10;
    const project = inputs.config.report?.project ?? 'Test suite';
    const score = Math.round(passRate);
    const model = {
        meta: {
            project,
            branch: inputs.branch,
            commit: inputs.commit,
            environment: inputs.environment,
            runAt: inputs.runAt,
            runId: inputs.runId,
        },
        verdict: {
            score,
            headline: failed === 0 ? 'Every declared test passed.' : `${failed} of ${total} tests failed.`,
            label: failed === 0 ? 'Suite passing' : 'Suite failing',
            summary: failed === 0
                ? 'The declared command suite completed without failures.'
                : 'At least one declared command did not produce its expected exit code.',
            confidence: `${passRate}% pass rate`,
            risk: failed === 0
                ? 'No failing command in this run.'
                : 'Failing commands are reported with their captured output; inspect the details table before release.',
        },
        kpis: [
            { label: 'Pass rate', value: `${passRate}%`, delta: `${passed} of ${total}`, ...(failed > 0 ? { worse: true } : {}) },
            { label: 'Total tests', value: String(total), delta: `${total} declared` },
            { label: 'Duration', value: formatDuration(durationSeconds), delta: 'wall clock' },
            { label: 'Failed', value: String(failed), delta: failed === 0 ? 'none' : 'needs review', ...(failed > 0 ? { worse: true } : {}) },
        ],
        summary: { total, passed, failed, skipped, flaky, durationSeconds, coveragePercent: null },
        trend: [],
        causes: failed === 0
            ? []
            : [{ label: 'Non-zero exit', count: failed }],
        slowest: [...tests]
            .sort((left, right) => right.durationSeconds - left.durationSeconds)
            .slice(0, 10)
            .map((test, index) => ({ rank: index + 1, name: test.name, suite: test.suite, durationSeconds: test.durationSeconds })),
        timeline: outcomes.reduce((state, outcome) => {
            const measuredDuration = Math.round(outcome.durationMs / 10) / 100;
            state.items.push({ label: outcome.testCase.name, startSeconds: state.elapsed, durationSeconds: measuredDuration });
            state.elapsed += measuredDuration;
            return state;
        }, { items: [], elapsed: 0 }).items,
        regressions: [],
        recovered: [],
        tests,
    };
    if (inputs.experienceSection !== undefined) {
        return { ...model, ...inputs.experienceSection };
    }
    return model;
}
