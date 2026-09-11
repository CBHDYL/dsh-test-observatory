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
import { ensurePageHelpers } from "./in-page.js";
/** Share of the page's visible text a region must carry to be a candidate. */
export const MIN_TEXT_SHARE = 0.3;
/** Regions smaller than this in either axis are not worth a capture on their own. */
export const MIN_REGION_PX = 120;
/** A region covering more than this share of the viewport is the page, not a part of it. */
export const MAX_VIEWPORT_SHARE = 0.85;
/**
 * Pick the densest region that carries most of the page's visible text.
 *
 * Runs inside the page, so it uses only globals the browser provides and never
 * reaches back into this module.
 * @returns the chosen region, or undefined when the page has no such region.
 */
export function detectContentRegion() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportArea = Math.max(1, viewportWidth * viewportHeight);
    const visible = (element) => {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)
            return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };
    const textLength = (element) => (element.textContent ?? '').replace(/\s+/gu, ' ').trim().length;
    const bodyChars = textLength(document.body);
    if (bodyChars === 0)
        return undefined;
    const candidates = [];
    for (const selector of ['main', '[role="main"]', 'article', 'section', '#app', '#root']) {
        for (const element of Array.from(document.querySelectorAll(selector)))
            candidates.push(element);
    }
    for (const child of Array.from(document.body.children)) {
        candidates.push(child);
        for (const grandchild of Array.from(child.children))
            candidates.push(grandchild);
    }
    let best;
    let bestScore = 0;
    let bestTag = '';
    for (const element of candidates) {
        if (!visible(element))
            continue;
        const chars = textLength(element);
        if (chars < bodyChars * 0.3)
            continue;
        const rect = element.getBoundingClientRect();
        if (rect.width < 120 || rect.height < 120)
            continue;
        if (rect.width * rect.height > viewportArea * 0.85)
            continue;
        const score = chars / Math.max(1, rect.width * rect.height);
        if (score > bestScore) {
            bestScore = score;
            bestTag = element.tagName.toLowerCase();
            const x = Math.max(0, Math.round(rect.left));
            const y = Math.max(0, Math.round(rect.top));
            // Ink is the union of the text-bearing boxes inside the region, measured
            // in the page rather than decoded from the image.
            let inkArea = 0;
            const seenRects = [];
            for (const child of Array.from(element.querySelectorAll('*'))) {
                if (!visible(child))
                    continue;
                if ((child.textContent ?? '').trim().length === 0)
                    continue;
                const childRect = child.getBoundingClientRect();
                const box = { left: Math.max(rect.left, childRect.left), top: Math.max(rect.top, childRect.top), right: Math.min(rect.right, childRect.right), bottom: Math.min(rect.bottom, childRect.bottom) };
                if (box.right <= box.left || box.bottom <= box.top)
                    continue;
                let covered = false;
                for (const other of seenRects) {
                    if (other.left <= box.left && other.top <= box.top && other.right >= box.right && other.bottom >= box.bottom) {
                        covered = true;
                        break;
                    }
                }
                if (covered)
                    continue;
                seenRects.push(box);
                inkArea += (box.right - box.left) * (box.bottom - box.top);
            }
            const inkShare = Math.min(1, inkArea / Math.max(1, rect.width * rect.height));
            best = {
                reason: bestTag + ' carries ' + String(Math.round((100 * chars) / bodyChars)) + '% of the page text in ' + String(Math.round(rect.width)) + 'x' + String(Math.round(rect.height)),
                inkShare,
                x,
                y,
                width: Math.min(Math.round(rect.width), viewportWidth - x),
                height: Math.min(Math.round(rect.height), viewportHeight - y),
                textChars: chars,
            };
        }
    }
    return best !== undefined && best.width >= 120 && best.height >= 120 ? best : undefined;
}
/**
 * Ask the page which region a capture should show.
 * @param page - the page to inspect.
 * @returns the chosen region, or undefined when the page has no distinct one.
 */
export async function focusRegion(page) {
    await ensurePageHelpers(page);
    const evaluator = page;
    return await evaluator.evaluate(detectContentRegion);
}
