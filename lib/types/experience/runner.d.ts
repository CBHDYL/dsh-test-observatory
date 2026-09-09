/**
 * Browser journey execution: drive one declared journey per persona through a
 * real headless Chromium, settle every step, and capture the evidence the
 * report shows. The launcher is a module seam so the runner is testable
 * without a browser.
 * @module @deepseek-ai/dsh-experience-runner/runner
 */
import { type Browser } from 'playwright-core';
import type { ExperienceRun, JourneySpec } from './types.ts';
/** Default per-step deadline in milliseconds. */
export declare const DEFAULT_STEP_TIMEOUT_MS = 15000;
/** Default viewport for a journey that declares none. */
export declare const DEFAULT_VIEWPORT: {
    readonly width: 1440;
    readonly height: 900;
};
/** Bound on one captured screenshot's encoded size, so the report stays openable. */
export declare const MAX_SHOT_BYTES = 400000;
/** Browser launcher seam. */
export type BrowserLauncher = (executablePath: string | undefined) => Promise<Browser>;
/**
 * Default launcher: headless Chromium, with the executable resolved by the caller.
 * @param executablePath - resolved executable, or undefined to let Playwright choose.
 * @returns the launched browser.
 */
export declare function launchChromium(executablePath: string | undefined): Promise<Browser>;
/**
 * Resolve the Chromium executable the way the browser tool does, so one
 * environment variable configures both.
 * @returns the executable path, or undefined to let Playwright choose.
 */
export declare function resolveExecutable(): string | undefined;
/** Options of {@link runExperience}. */
export interface RunOptions {
    /** The declared journeys. */
    readonly journeys: readonly JourneySpec[];
    /** Browser launcher seam (defaults to headless Chromium). */
    readonly launch?: BrowserLauncher;
    /** Executable resolver seam (defaults to {@link resolveExecutable}). */
    readonly executable?: () => string | undefined;
    /** Caller cancellation. */
    readonly signal?: AbortSignal;
    /** Whether to run the deterministic visual checks (default true). */
    readonly visualChecks?: boolean;
    /** Whether to run the axe-core accessibility scan (default true). */
    readonly accessibilityChecks?: boolean;
    /** Extra attempts per failed step (default 0). */
    readonly retries?: number;
}
/**
 * Drive every declared journey in a real browser and collect the evidence.
 * The browser is always closed, including on cancellation.
 * @param options - the declared journeys and the launcher seams.
 * @returns the settled run.
 */
export declare function runExperience(options: RunOptions): Promise<ExperienceRun>;
