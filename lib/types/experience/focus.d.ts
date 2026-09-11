/**
 * Choose what a screenshot should show.
 *
 * A whole-viewport capture of a sparse page is mostly empty space, and the
 * reader cannot tell which part the step was about. Hand-written selectors do
 * not travel: a plugin installed on another machine has no idea what that
 * project's markup looks like. This module decides from the rendered document
 * alone, so the same plugin works on any project without configuration.
 *
 * The rule is the densest region that still carries most of the page's text:
 * the smallest element holding a large share of the content is the one a
 * reader wants, and its density separates it from a full-height wrapper that
 * also contains everything.
 * @module @cbhdyl/dsh-test-observatory/experience/focus
 */
import type { Page } from 'playwright-core';
/** A region of the page worth capturing. */
export interface ContentRegion {
    /** How the region was found, for the capture's caption. */
    readonly reason: string;
    /** Left edge in CSS pixels. */
    readonly x: number;
    /** Top edge in CSS pixels. */
    readonly y: number;
    /** Width in CSS pixels. */
    readonly width: number;
    /** Height in CSS pixels. */
    readonly height: number;
    /** Visible characters the region carries. */
    readonly textChars: number;
    /**
     * Share of the region covered by visible boxes that carry text. A dashboard
     * with a few cards on a large surface measures low, which is exactly what a
     * reader needs to know before judging the screenshot.
     */
    readonly inkShare: number;
}
/** Share of the page's visible text a region must carry to be a candidate. */
export declare const MIN_TEXT_SHARE = 0.3;
/** Regions smaller than this in either axis are not worth a capture on their own. */
export declare const MIN_REGION_PX = 120;
/** A region covering more than this share of the viewport is the page, not a part of it. */
export declare const MAX_VIEWPORT_SHARE = 0.85;
/**
 * Pick the densest region that carries most of the page's visible text.
 *
 * Runs inside the page, so it uses only globals the browser provides and never
 * reaches back into this module.
 * @returns the chosen region, or undefined when the page has no such region.
 */
export declare function detectContentRegion(): ContentRegion | undefined;
/**
 * Ask the page which region a capture should show.
 * @param page - the page to inspect.
 * @returns the chosen region, or undefined when the page has no distinct one.
 */
export declare function focusRegion(page: Page): Promise<ContentRegion | undefined>;
