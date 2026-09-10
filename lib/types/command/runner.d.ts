/**
 * Suite execution: run every declared case, then build the report model the
 * renderer consumes. The command shell is the only external dependency, so the
 * model construction is a pure function of the settled case outcomes.
 * @module @deepseek-ai/dsh-command-test/runner
 */
import type { ReportModel, ReportTest } from '../report/index.ts';
import type { SuiteCase, SuiteConfig } from './types.ts';
/** Bound on captured output per stream, so one noisy case cannot bloat the report. */
export declare const MAX_CAPTURED_CHARS = 20000;
/** One settled case outcome. */
export interface CaseOutcome {
    /** The case that ran. */
    readonly testCase: SuiteCase;
    /** Exit code, or null when the process was killed or timed out. */
    readonly exitCode: number | null;
    /** Whether the exit code matched the expectation. */
    readonly passed: boolean;
    /** Wall-clock duration in milliseconds. */
    readonly durationMs: number;
    /** Captured stdout, truncated to {@link MAX_CAPTURED_CHARS}. */
    readonly stdout: string;
    /** Captured stderr, truncated to {@link MAX_CAPTURED_CHARS}. */
    readonly stderr: string;
}
/**
 * Truncate captured output with a visible marker.
 * @param value - the captured text.
 * @returns the text, truncated when it exceeds the bound.
 */
export declare function truncate(value: string): string;
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
export declare function runCase(testCase: SuiteCase, signal: AbortSignal, cwd?: string): Promise<CaseOutcome>;
/** Inputs of {@link buildReportModel} that are not derived from the outcomes. */
/** Optional experience section spread into the report model. */
export interface ExperienceInputs {
    readonly experience: NonNullable<ReportModel['experience']>;
    readonly personas: NonNullable<ReportModel['personas']>;
    readonly journeys: NonNullable<ReportModel['journeys']>;
    readonly evidence: NonNullable<ReportModel['evidence']>;
    readonly findings: NonNullable<ReportModel['findings']>;
    readonly checks: NonNullable<ReportModel['checks']>;
}
/** Inputs of {@link buildReportModel} that are not derived from the outcomes. */
export interface ReportInputs {
    /** The configuration that was executed. */
    readonly config: SuiteConfig;
    /** Run timestamp, already formatted for display. */
    readonly runAt: string;
    /** Run identifier shown in the report eyebrow. */
    readonly runId: string;
    /** Branch name shown in the header. */
    readonly branch: string;
    /** Commit identifier shown in the header. */
    readonly commit: string;
    /** Environment label shown in the header. */
    readonly environment: string;
    /** Experience section, present only when a human-simulation run happened. */
    readonly experienceSection?: ExperienceInputs;
    /** Parsed framework-level test rows, replacing command summary rows when present. */
    readonly structuredTests?: readonly ReportTest[];
}
/**
 * Build the report model from settled outcomes.
 * @param outcomes - every settled case outcome, in declaration order.
 * @param inputs - run identity the caller knows.
 * @returns the renderable report model.
 */
export declare function buildReportModel(outcomes: readonly CaseOutcome[], inputs: ReportInputs): ReportModel;
