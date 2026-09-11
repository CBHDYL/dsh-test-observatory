/**
 * Whether an element's computed style draws a visible focus indicator.
 * @param style - the element's computed style.
 * @returns true when an outline or a shadow would be visible.
 */
export function drawsFocusIndicator(style) {
    // A colour may sit anywhere in a longer value, so it is found rather than
    // assumed to be the whole string.
    const isTransparent = (value) => {
        const text = value.trim().toLowerCase();
        if (text === '' || text === 'none')
            return false;
        if (text === 'transparent')
            return true;
        const match = /rgba?\(([^)]*)\)/.exec(text);
        if (match !== null) {
            const parts = match[1].split(/[\s,/]+/).filter(part => part !== '');
            if (parts.length < 4)
                return false;
            const alpha = Number.parseFloat(parts[3]);
            return Number.isFinite(alpha) && alpha === 0;
        }
        return text.split(/\s+/).includes('transparent');
    };
    const width = Number.parseFloat(style.outlineWidth === '' ? '0' : style.outlineWidth);
    const shorthand = style.outline === '' ? '' : String(style.outline).trim().toLowerCase();
    // The keyword is matched as a whole word, because a colour in the same
    // shorthand may itself contain spaces.
    const shorthandSuppressed = /(^|\s)none(\s|$)/.test(shorthand);
    const shorthandWidthText = /(^|\s)([0-9]*\.?[0-9]+)(?:px|em|rem|pt)(\s|$)|(^|\s)(thin|medium|thick)(\s|$)/.exec(shorthand);
    const shorthandPixels = shorthandWidthText?.[2] === undefined ? undefined : Number.parseFloat(shorthandWidthText[2]);
    // A named width is always positive; a numeric one is only drawn when non-zero.
    const shorthandHasWidth = shorthandWidthText !== null && (shorthandPixels === undefined || shorthandPixels > 0);
    const shorthandDrawn = shorthand !== '' && !shorthandSuppressed && shorthandHasWidth && !isTransparent(shorthand);
    const longhandDrawn = style.outlineStyle !== 'none' && width > 0 && !isTransparent(style.outlineColor);
    const shadow = style.boxShadow === '' ? 'none' : String(style.boxShadow);
    return shorthandDrawn || longhandDrawn || (shadow !== 'none' && !isTransparent(shadow));
}
/**
 * The source text of {@link drawsFocusIndicator}, for embedding in a serialized
 * inspection that runs in the page.
 * @returns the function source as an expression.
 */
export function drawsFocusIndicatorSource() {
    return '(' + drawsFocusIndicator.toString() + ')';
}
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
export async function ensurePageHelpers(page) {
    const installer = page;
    await installer.evaluate(() => {
        const scope = globalThis;
        if (typeof scope.__name !== 'function') {
            scope.__name = (value) => value;
        }
    });
}
