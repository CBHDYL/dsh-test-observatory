/**
 * Reaching a target without a pointer.
 *
 * A keyboard-only user does not click: they Tab until the element they want has
 * focus and then activate it. This module performs that search and reports what
 * actually received focus along the way, so a target that cannot be reached
 * within the budget becomes a finding instead of a silent failure — which is
 * exactly the class of defect an automated rule scan cannot detect.
 * @module @deepseek-ai/dsh-experience-runner/behavior/keyboard
 */
import type { Page } from 'playwright-core';
/** What one focus step landed on. */
export interface FocusStop {
    /** Lowercase tag name of the focused element. */
    readonly tag: string;
    /** Accessible-ish description, from id, name, aria-label or text. */
    readonly label: string;
    /** Whether the focused element has a visible focus indicator. */
    readonly focusVisible: boolean;
}
/** The outcome of trying to focus one target. */
export interface KeyboardReach {
    /** Whether the target received focus within the budget. */
    readonly reached: boolean;
    /** Tabs pressed, including the final one when the target was reached. */
    readonly tabs: number;
    /** Every element focus passed through, in order. */
    readonly stops: readonly FocusStop[];
}
/** Default number of Tabs attempted before a target counts as unreachable. */
export declare const DEFAULT_TAB_BUDGET = 40;
/** Page operations the reach needs, kept narrow so a double can supply them. */
export interface KeyboardPage {
    /** The Playwright page under test. */
    readonly page: Page;
}
/**
 * Tab until the target has focus, up to a budget.
 * @param page - the page to drive.
 * @param selector - the CSS selector of the element to reach.
 * @param budget - maximum Tabs to press, and whether Shift is held.
 * @returns what was reached and everything focus passed through.
 */
export declare function tabToTarget(page: Page, selector: string, budget?: number): Promise<KeyboardReach>;
/**
 * Activate the focused element the way a keyboard user would.
 * @param page - the page to drive.
 * @param key - the activation key; Enter is the default for links and buttons.
 * @returns a promise settling when the key has been sent.
 */
export declare function activateFocused(page: Page, key?: string): Promise<void>;
/**
 * Dismiss whatever dialog is open with the keyboard's standard escape.
 * @param page - the page to drive.
 * @returns a promise settling when Escape has been sent.
 */
export declare function pressEscape(page: Page): Promise<void>;
