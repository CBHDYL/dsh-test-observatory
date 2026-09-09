/**
 * Accessibility scanning through axe-core. The library is injected into the
 * page and run there, so the scan sees the same rendered DOM the user does;
 * the result is mapped onto the report's violation vocabulary.
 * @module @deepseek-ai/dsh-experience-runner/a11y
 */
import type { Page } from 'playwright-core';
import type { VisualViolation } from './visual.ts';
/**
 * Run an axe-core scan over the page's current state.
 * @param page - the page to scan.
 * @returns the violations, one per axe rule with at least one node.
 */
export declare function checkAccessibility(page: Page): Promise<readonly VisualViolation[]>;
