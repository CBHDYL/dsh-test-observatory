import type { Page } from 'playwright-core';
import type { ElementEvidence } from './geometry.ts';
import type { VisualViolation } from './visual.ts';
/** Elements kept per violation, so one noisy rule cannot bloat the model. */
export declare const MAX_AXE_NODES = 10;
/** The slice of one axe node this module reads. */
export interface AxeNode {
    /** CSS selectors axe computed for the node; the first is the most specific. */
    target?: readonly (string | string[])[];
    /** The node's rendered text, already excerpted by axe. */
    html?: string;
    /** Selectors axe could not resolve, reported alongside `target`. */
    ancestry?: readonly unknown[];
}
/** The slice of one axe violation this module reads. */
interface AxeViolation {
    readonly id: string;
    readonly impact: string | null;
    readonly help: string;
    readonly nodes: readonly AxeNode[];
}
/** Result of one in-page axe run. */
interface AxeReport {
    readonly violations: readonly AxeViolation[];
}
/** Whether a run reports a structured axe payload.
 * @param value - the value an in-page run returned.
 * @returns the report, or undefined when the value is not one.
 */
export declare function asAxeReport(value: unknown): AxeReport | undefined;
/** The selectors a node's target reports, ignoring the nested form.
 * @param node - the axe node.
 * @returns the flat selectors, in reported order.
 */
export declare function targetsOf(node: AxeNode): readonly string[];
/** The selectors from the nested target form axe may report.
 * @param node - the axe node.
 * @returns the nested selectors, flattened, in reported order.
 */
export declare function nestedTargetsOf(node: AxeNode): readonly string[];
/** The first selector axe reported for a node, preferring the flat form.
 * @param node - the axe node.
 * @returns the selector, or undefined when the node reported none.
 */
export declare function selectorOf(node: AxeNode): string | undefined;
/** A readable tag name inferred from the node's markup, then its selector.
 * @param node - the axe node.
 * @param selector - the selector already derived for the node.
 * @returns a lowercase tag name, or `element` when neither source names one.
 */
export declare function tagOf(node: AxeNode, selector: string | undefined): string;
/** The node's visible text, collapsed and truncated for display.
 * @param node - the axe node.
 * @returns the excerpt, or undefined when the markup carries no text.
 */
export declare function textOf(node: AxeNode): string | undefined;
/** The element evidence for one axe node that reported a selector.
 * @param node - the axe node.
 * @returns the reference and rectangle, or undefined when no selector was reported.
 */
export declare function evidenceOf(node: AxeNode): ElementEvidence | undefined;
/**
 * Run an axe-core scan over the page's current state.
 * @param page - the page to scan.
 * @returns the violations, one per axe rule with the nodes that tripped it.
 */
export declare function checkAccessibility(page: Page): Promise<readonly VisualViolation[]>;
export {};
