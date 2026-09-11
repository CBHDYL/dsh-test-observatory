/**
 * Draw finding regions onto a page before a screenshot, and remove them again.
 *
 * The overlay is injected as real DOM so the browser's own renderer draws it:
 * the captured image then contains crisp boxes and labels at exactly the
 * coordinates the checks measured, without a bitmap library and without a
 * second coordinate system to keep in sync.
 *
 * Only findings measured in the viewport space can be drawn, because a viewport
 * screenshot shares that space. Anything else is skipped rather than drawn in
 * the wrong place.
 * @module @deepseek-ai/dsh-experience-runner/annotate
 */
import type { Page } from 'playwright-core';
import type { ElementEvidence } from './geometry.ts';
/** One region to mark, with the label shown beside it. */
export interface Annotation {
    /** Short label, such as a rule id with its index. */
    readonly label: string;
    /** The element reference and rectangle the label describes. */
    readonly evidence: ElementEvidence;
    /** Whether the region blocks a user task, which selects the colour. */
    readonly severity: 'high' | 'medium';
}
/** Handle that removes an injected overlay. */
export interface OverlayHandle {
    /** Remove the overlay from the page. Safe to call more than once. */
    remove(): Promise<void>;
}
/** Attribute marking every node this module injects, so removal is exact. */
export declare const OVERLAY_ATTRIBUTE = "data-observatory-overlay";
/** Colour used for a blocking finding. */
export declare const HIGH_COLOR = "#e5484d";
/** Colour used for a non-blocking finding. */
export declare const MEDIUM_COLOR = "#d97706";
/** Label geometry drawn by the page, mirrored here for the tests. */
export interface OverlayRect {
    readonly label: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
/** Result of one overlay injection. */
export interface OverlayResult {
    /** Regions actually drawn, in viewport coordinates. */
    readonly drawn: readonly OverlayRect[];
    /** Regions skipped because their coordinates were not viewport-space. */
    readonly skipped: readonly string[];
}
/**
 * Draw the given regions and return a handle that removes them.
 *
 * The overlay is `position:fixed`, ignores pointer events and sits at the top
 * of the stacking order, so it cannot change layout, intercept a click or be
 * covered by page content. The caller must inject it *after* every page check
 * has run, so checks never observe the marks they produced.
 * @param page - the page to mark.
 * @param annotations - the regions to draw.
 * @returns the handle plus what was drawn and skipped.
 */
export declare function annotate(page: Page, annotations: readonly Annotation[]): Promise<OverlayResult & OverlayHandle>;
/**
 * Whether any overlay node is still attached to the page.
 * @param page - the page to inspect.
 * @returns true when at least one overlay node remains.
 */
export declare function overlayPresent(page: Page): Promise<boolean>;
