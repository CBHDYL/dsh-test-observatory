/**
 * Deterministic visual checks over a live page. Every finding is a browser
 * fact — a measurement, a failed request, a missing attribute — so the visual
 * dimension of the score reproduces from the run rather than from an opinion.
 *
 * Each finding also carries the element it describes and that element's
 * measured rectangle, so the report can mark the region on a screenshot instead
 * of only naming the defect in prose.
 *
 * The inspection itself is a self-contained function: it is serialized into
 * the page by Playwright, so it closes over nothing, and it is unit-tested
 * directly against a DOM.
 * @module @deepseek-ai/dsh-experience-runner/visual
 */
import type { Page } from 'playwright-core';
import type { ElementEvidence } from './geometry.ts';
/** One visual violation. */
export interface VisualViolation {
    /** Stable rule id, such as `image-broken`. */
    readonly rule: string;
    /** What was observed, in concrete terms. */
    readonly detail: string;
    /** Whether the finding blocks a user task. */
    readonly severity: 'high' | 'medium';
    /** Every element the finding describes, with its measured rectangle. */
    readonly evidence: readonly ElementEvidence[];
}
/**
 * Describe one element as a reference plus its measured rectangle. Defined
 * inside the serialized function's scope by {@link collectViolations}; declared
 * here only to state the contract.
 * @param element - the element to describe.
 * @returns the reference and rectangle.
 */
type DescribeElement = (element: Element) => ElementEvidence;
/**
 * Inspect one rendered document for objective visual defects. Self-contained by
 * contract: it closes over nothing, so Playwright can serialize it into a page.
 * @param root - the document to inspect.
 * @returns the violations found, in rule order, each with its target geometry.
 */
export declare function collectViolations(root: Document): VisualViolation[];
/**
 * Collect the visual violations of the page's current state.
 * @param page - the page to measure.
 * @returns the violations found, in rule order.
 */
export declare function checkVisual(page: Page): Promise<readonly VisualViolation[]>;
/** The serializer-facing shape of {@link collectViolations}, for tests. */
export type { DescribeElement };
