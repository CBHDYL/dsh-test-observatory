/**
 * Applying a persona's network and CPU conditions to a page.
 *
 * Both are applied through the browser's own emulation, so the page experiences
 * them the way it would on a real device: requests take longer, and script runs
 * with less CPU. That matters because the findings these conditions produce —
 * a missing loading indicator, an action that never becomes available — only
 * exist when something is actually slow.
 *
 * Conditions are applied per page and removed with it, so one slow persona never
 * degrades another's journey.
 * @module @deepseek-ai/dsh-experience-runner/behavior/environment
 */
import type { Page } from 'playwright-core';
import type { EnvironmentPolicy } from './types.ts';
/** Transfer parameters of one emulated network profile. */
interface NetworkProfile {
    /** Download rate in bytes per second. */
    readonly downloadBytesPerSecond: number;
    /** Upload rate in bytes per second. */
    readonly uploadBytesPerSecond: number;
    /** Round-trip latency in milliseconds. */
    readonly latencyMs: number;
}
/**
 * The emulated profiles, expressed the way the browser's own emulation wants
 * them: bytes per second, not the kilobits per second the names suggest.
 */
export declare const NETWORK_PROFILES: Readonly<Record<NonNullable<EnvironmentPolicy['network']>, NetworkProfile>>;
/** One applied condition, and the handle that removes it. */
export interface AppliedEnvironment {
    /** Profiles and multipliers actually applied, for the report. */
    readonly applied: readonly string[];
    /** Remove every applied condition. */
    readonly restore: () => Promise<void>;
}
/**
 * Apply a persona's environment to one page.
 *
 * CPU throttling is applied after the network profile so a page that is both slow
 * and CPU-bound is measured under both, and both are lifted together.
 * @param page - the page to condition.
 * @param environment - the policy to apply.
 * @returns what was applied and how to remove it.
 */
export declare function applyEnvironment(page: Page, environment: EnvironmentPolicy): Promise<AppliedEnvironment>;
export {};
