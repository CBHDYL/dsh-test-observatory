/**
 * Deterministic visual checks over a live page. Every finding is a browser
 * fact — a measurement, a failed request, a missing attribute — so the visual
 * dimension of the score reproduces from the run rather than from an opinion.
 *
 * The inspection itself is a self-contained function: it is serialized into
 * the page by Playwright, and unit-tested directly against a DOM.
 * @module @deepseek-ai/dsh-experience-runner/visual
 */
import type { Page } from 'playwright-core';
/** One visual violation. */
export interface VisualViolation {
    /** Stable rule id, such as `image-broken`. */
    readonly rule: string;
    /** What was observed, in concrete terms. */
    readonly detail: string;
    /** Whether the finding blocks a user task. */
    readonly severity: 'high' | 'medium';
}
/**
 * Inspect one rendered document for objective visual defects. Self-contained by
 * contract: it closes over nothing, so Playwright can serialize it into a page.
 * @param root - the document to inspect.
 * @returns the violations found, in rule order.
 */
export declare function collectViolations(root: Document): VisualViolation[];
/**
 * Collect the visual violations of the page's current state.
 * @param page - the page to measure.
 * @returns the violations found, in rule order.
 */
export declare function checkVisual(page: Page): Promise<readonly VisualViolation[]>;
