/**
 * Support for functions that are serialized into the page.
 *
 * Both the visual and the keyboard inspections are sent to the browser by
 * serializing the function source. Two things go wrong when that source runs in
 * a page, and both are handled here:
 *
 * 1. A bundler may rewrite a named function expression into a call to a helper
 *    it defines at module scope. That helper does not exist in the page, so the
 *    serialized source fails with a ReferenceError the moment it runs.
 * 2. An outline may be expressed through the `outline` shorthand, whose
 *    computed value places the colour, the style and the width in any order —
 *    `rgb(0, 0, 0) none 3px` is a real example. Splitting that string on
 *    whitespace breaks the colour apart and misreads a suppressed outline as a
 *    drawn one.
 *
 * {@link drawsFocusIndicator} is self-contained by contract: it closes over
 * nothing, so {@link serializeInspection} can embed it in another function.
 * @module @deepseek-ai/dsh-experience-runner/in-page
 */
import type { Page } from 'playwright-core';
/**
 * Whether an element's computed style draws a visible focus indicator.
 * @param style - the element's computed style.
 * @returns true when an outline or a shadow would be visible.
 */
export declare function drawsFocusIndicator(style: CSSStyleDeclaration): boolean;
/**
 * The source text of {@link drawsFocusIndicator}, for embedding in a serialized
 * inspection that runs in the page.
 * @returns the function source as an expression.
 */
export declare function drawsFocusIndicatorSource(): string;
/**
 * Make a serializer-rewritten helper available to page-context functions.
 *
 * The stand-in returns the function unchanged, which preserves the only
 * behaviour the serialized code relies on: naming a function has no effect on
 * how it runs. An existing definition is left alone, so a page that already
 * provides one keeps it.
 * @param page - the page that will run the serialized function.
 * @returns a promise settling once the helper is defined.
 */
export declare function ensurePageHelpers(page: Page): Promise<void>;
