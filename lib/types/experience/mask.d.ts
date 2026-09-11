/**
 * Dynamic-content masking for captures.
 *
 * A timestamp, a live counter or an avatar changes between two runs of the same
 * page, so a capture that includes one cannot be compared with any later
 * capture. Masking hides those regions for the duration of one capture and
 * restores them afterwards, so the page itself is never modified in a lasting
 * way.
 * @module @deepseek-ai/dsh-experience-runner/mask
 */
import type { Page } from 'playwright-core';
/** Handle that restores the elements a mask hid. */
export interface MaskHandle {
    /** Selectors that matched at least one element. */
    readonly matched: readonly string[];
    /** Selectors that matched nothing, so a typo is visible rather than silent. */
    readonly unmatched: readonly string[];
    /** Restore visibility. Safe to call more than once. */
    restore(): Promise<void>;
}
/**
 * Hide the elements matching the given selectors.
 *
 * Visibility is saved and restored per element rather than via an injected
 * stylesheet, so an element's own inline style survives untouched.
 * @param page - the page to mask.
 * @param selectors - CSS selectors for dynamic regions.
 * @returns the handle that restores them.
 */
export declare function maskDynamic(page: Page, selectors: readonly string[]): Promise<MaskHandle>;
