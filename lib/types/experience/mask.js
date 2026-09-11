/**
 * Hide the elements matching the given selectors.
 *
 * Visibility is saved and restored per element rather than via an injected
 * stylesheet, so an element's own inline style survives untouched.
 * @param page - the page to mask.
 * @param selectors - CSS selectors for dynamic regions.
 * @returns the handle that restores them.
 */
export async function maskDynamic(page, selectors) {
    if (selectors.length === 0) {
        return { matched: [], unmatched: [], restore: async () => undefined };
    }
    const evaluator = page;
    const result = await evaluator.evaluate((wanted) => {
        const matched = [];
        const unmatched = [];
        for (const selector of wanted) {
            const found = Array.from(document.querySelectorAll(selector));
            if (found.length === 0) {
                unmatched.push(selector);
                continue;
            }
            matched.push(selector);
            for (const element of found) {
                const target = element;
                // The previous inline value is recorded so restore() is exact.
                target.setAttribute('data-observatory-mask-was', target.style.visibility);
                target.style.visibility = 'hidden';
            }
        }
        return { matched, unmatched };
    }, selectors);
    return {
        matched: result.matched,
        unmatched: result.unmatched,
        async restore() {
            const restorer = page;
            await restorer.evaluate(() => {
                for (const element of Array.from(document.querySelectorAll('[data-observatory-mask-was]'))) {
                    const target = element;
                    target.style.visibility = target.getAttribute('data-observatory-mask-was') ?? '';
                    target.removeAttribute('data-observatory-mask-was');
                }
            });
        },
    };
}
