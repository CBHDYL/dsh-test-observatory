/** Elements examined for a visible focus indicator, so one huge page stays bounded. */
export const MAX_FOCUS_SAMPLES = 60;
/** Tabs pressed inside a dialog before concluding focus is not trapped. */
export const TRAP_PROBE_TABS = 12;
/** Longest visible-text excerpt kept on a reference. */
const TEXT_LIMIT = 80;
/** Whether a candidate is visible enough for a user to reach it. */
const REACHABLE = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
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
export async function checkKeyboard(page) {
    const evaluator = page;
    // Serialized into the page: the inspection closes over nothing.
    const inspect = (config) => {
        const found = [];
        const elementInfo = (element) => {
            const rect = element.getBoundingClientRect();
            const box = { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height), space: 'viewport' };
            const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
            const ref = {
                tag: (element.tagName || 'element').toLowerCase(),
                selector: element.id !== '' ? '#' + element.id : (element.tagName || 'element').toLowerCase(),
                ...(text === '' ? {} : { text: text.length > config.textLimit ? text.slice(0, config.textLimit) + '…' : text }),
            };
            return { element: ref, box };
        };
        const isTransparent = (color) => {
            const value = color.trim().toLowerCase();
            if (value === '' || value === 'transparent')
                return true;
            const match = /^rgba?\(([^)]+)\)$/.exec(value);
            if (match === null)
                return false;
            const parts = match[1].split(/[\s,\/]+/).filter(part => part !== '');
            if (parts.length < 4)
                return false;
            const alpha = Number.parseFloat(parts[3]);
            return Number.isFinite(alpha) && alpha === 0;
        };
        const drawsFocus = (element) => {
            const style = window.getComputedStyle(element);
            const width = Number.parseFloat(style.outlineWidth === '' ? '0' : style.outlineWidth);
            const shorthand = style.outline === '' ? '' : style.outline;
            const shorthandDrawn = shorthand !== ''
                && !shorthand.startsWith('none')
                && !shorthand.split(/\s+/).some(part => isTransparent(part));
            const longhandDrawn = style.outlineStyle !== 'none' && width > 0 && !isTransparent(style.outlineColor);
            return shorthandDrawn || longhandDrawn || (style.boxShadow !== '' && style.boxShadow !== 'none');
        };
        // An element is only reachable if it is actually rendered. Style is the
        // signal rather than geometry, because a zero-sized element is exactly the
        // condition this check exists to catch.
        const isRendered = (element) => {
            let node = element;
            while (node !== null) {
                const style = window.getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')
                    return false;
                node = node.parentElement;
            }
            return true;
        };
        const candidates = Array.from(document.querySelectorAll(config.reachable))
            .filter(isRendered)
            .slice(0, config.maxSamples);
        const withoutIndicator = [];
        for (const candidate of candidates) {
            const focusable = candidate;
            focusable.focus();
            if (document.activeElement !== focusable)
                continue;
            if (!drawsFocus(focusable))
                withoutIndicator.push(candidate);
        }
        if (withoutIndicator.length > 0) {
            found.push({
                rule: 'keyboard-focus-not-visible',
                detail: String(withoutIndicator.length) + ' of ' + String(candidates.length) + ' reachable element(s) draw no visible focus indicator',
                severity: 'medium',
                evidence: withoutIndicator.slice(0, 10).map(elementInfo),
            });
        }
        const dialog = document.querySelector('[role="dialog"],[role="alertdialog"],dialog[open]');
        if (dialog === null)
            return found;
        const heading = dialog.getAttribute('aria-label') ?? dialog.getAttribute('aria-labelledby') ?? 'unnamed dialog';
        found.push({
            rule: 'keyboard-dialog-present',
            detail: 'a dialog is open at the end of the journey: ' + heading,
            severity: 'medium',
            evidence: [elementInfo(dialog)],
        });
        return found;
    };
    return await evaluator.evaluate(inspect, { reachable: REACHABLE, maxSamples: MAX_FOCUS_SAMPLES, textLimit: TEXT_LIMIT });
}
/**
 * Probe an open dialog with the keyboard: whether focus stays inside it, and
 * whether Escape dismisses it.
 *
 * These need real key events, so they cannot run inside a single page evaluation.
 * @param page - the page to drive.
 * @returns the violations found, in rule order.
 */
export async function probeOpenDialog(page) {
    const found = [];
    const locator = page.locator('[role="dialog"],[role="alertdialog"],dialog[open]');
    if (await locator.count() === 0)
        return found;
    const dialog = locator.first();
    if (!(await dialog.isVisible().catch(() => false)))
        return found;
    for (let index = 0; index < TRAP_PROBE_TABS; index++)
        await page.keyboard.press('Tab');
    const escaped = await dialog.evaluate((node) => {
        const active = document.activeElement;
        return active === null || !node.contains(active);
    });
    if (escaped) {
        found.push({
            rule: 'keyboard-focus-trap-missing',
            detail: 'focus left the open dialog after ' + String(TRAP_PROBE_TABS) + ' Tab presses, so a keyboard user can reach the page behind it',
            severity: 'high',
            evidence: [],
        });
    }
    await page.keyboard.press('Escape');
    const dismissed = await dialog.isVisible().then(visible => !visible).catch(() => false);
    if (!dismissed) {
        found.push({
            rule: 'keyboard-escape-ignored',
            detail: 'Escape did not dismiss the open dialog',
            severity: 'high',
            evidence: [],
        });
    }
    return found;
}
