import type { Page } from 'playwright-core';
import type { VisualViolation } from './visual.ts';
/** Elements kept per violation, so one noisy rule cannot bloat the model. */
export declare const MAX_AXE_NODES = 10;
/**
 * Run an axe-core scan over the page's current state.
 * @param page - the page to scan.
 * @returns the violations, one per axe rule with the nodes that tripped it.
 */
export declare function checkAccessibility(page: Page): Promise<readonly VisualViolation[]>;
