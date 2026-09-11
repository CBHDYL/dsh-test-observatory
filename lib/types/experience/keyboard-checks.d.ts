/**
 * Keyboard checks: the barriers an automated rule scan cannot decide.
 *
 * axe and its peers read the DOM for missing attributes. Whether focus is
 * actually drawn, whether a dialog keeps focus inside itself, and whether Escape
 * dismisses it are experiences, not attributes — a page can pass every rule and
 * still be unusable without a pointer. Each finding states how it was observed,
 * because the focus-indicator check is a heuristic and the reader has to know
 * that, not just the verdict.
 * @module @deepseek-ai/dsh-experience-runner/keyboard-checks
 */
import type { Page } from 'playwright-core';
import type { VisualViolation } from './visual.ts';
/** Elements examined for a visible focus indicator, so one huge page stays bounded. */
export declare const MAX_FOCUS_SAMPLES = 60;
/** Tabs pressed inside a dialog before concluding focus is not trapped. */
export declare const TRAP_PROBE_TABS = 12;
/**
 * Inspect the page for keyboard barriers.
 *
 * Runs in three passes:
 * 1. Each focusable element is focused in turn and its computed style examined,
 *    because a focus indicator only exists while its element has focus.
 * 2. Any visible dialog is probed with Tab to see whether focus stays inside.
 * 3. That dialog is sent Escape to see whether it dismisses.
 * @param page - the page to inspect.
 * @returns the violations found, in rule order.
 */
export declare function checkKeyboard(page: Page): Promise<readonly VisualViolation[]>;
/**
 * Probe an open dialog with the keyboard: whether focus stays inside it, and
 * whether Escape dismisses it.
 *
 * These need real key events, so they cannot run inside a single page evaluation.
 * @param page - the page to drive.
 * @returns the violations found, in rule order.
 */
export declare function probeOpenDialog(page: Page): Promise<readonly VisualViolation[]>;
