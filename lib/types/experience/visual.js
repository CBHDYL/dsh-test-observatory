/**
 * Inspect one rendered document for objective visual defects. Self-contained by
 * contract: it closes over nothing, so Playwright can serialize it into a page.
 * @param root - the document to inspect.
 * @returns the violations found, in rule order, each with its target geometry.
 */
export function collectViolations(root) {
    const violations = [];
    // Serialized into the page, so every helper lives inside this scope.
    const TEXT_LIMIT = 80;
    const cssEscape = (value) => {
        const escapeOne = (character) => /[a-zA-Z0-9_-]/.test(character) ? character : '\\' + character;
        return value.split('').map(escapeOne).join('');
    };
    const selectorOf = (element) => {
        if (element.id !== '')
            return '#' + cssEscape(element.id);
        const parts = [];
        let current = element;
        while (current !== null && (current.tagName ?? 'html').toLowerCase() !== 'html') {
            const tag = (current.tagName ?? 'html').toLowerCase();
            const parent = current.parentElement;
            if (parent === null) {
                parts.unshift(tag);
                break;
            }
            const sameTag = Array.from(parent.children).filter(child => child.tagName === current?.tagName);
            parts.unshift(sameTag.length > 1 ? tag + ':nth-of-type(' + String(sameTag.indexOf(current) + 1) + ')' : tag);
            current = parent;
        }
        return parts.join(' > ');
    };
    const textOf = (element) => {
        const raw = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (raw.length === 0)
            return undefined;
        return raw.length > TEXT_LIMIT ? raw.slice(0, TEXT_LIMIT) + '…' : raw;
    };
    const describe = (element) => {
        const rect = element.getBoundingClientRect();
        const box = {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            space: 'viewport',
        };
        const text = textOf(element);
        const tag = (element.tagName ?? 'html').toLowerCase();
        const ref = { tag, selector: selectorOf(element), ...(text === undefined ? {} : { text }) };
        return { element: ref, box };
    };
    const describeAll = (elements, limit) => elements.slice(0, limit).map(describe);
    /** Elements kept per finding, so one broken page cannot bloat the model. */
    const MAX_EVIDENCE = 10;
    const images = Array.from(root.querySelectorAll('img'));
    const broken = images.filter(image => image.complete && image.naturalWidth === 0);
    if (broken.length > 0) {
        const source = broken[0]?.getAttribute('src');
        violations.push({
            rule: 'image-broken',
            detail: String(broken.length) + ' image(s) failed to load, first: ' + (source === null || source === undefined ? '(no src)' : source),
            severity: 'high',
            evidence: describeAll(broken, MAX_EVIDENCE),
        });
    }
    const unlabelled = images.filter(image => !image.hasAttribute('alt'));
    if (unlabelled.length > 0) {
        violations.push({
            rule: 'image-no-alt',
            detail: String(unlabelled.length) + ' image(s) have no alt attribute',
            severity: 'medium',
            evidence: describeAll(unlabelled, MAX_EVIDENCE),
        });
    }
    const doc = root.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    if (overflow > 2) {
        violations.push({
            rule: 'horizontal-overflow',
            detail: 'page is ' + String(overflow) + 'px wider than the viewport',
            severity: 'high',
            evidence: describeAll([doc], 1),
        });
    }
    const viewport = root.defaultView;
    const viewportWidth = viewport === null ? 0 : viewport.innerWidth;
    const outside = Array.from(root.querySelectorAll('body *')).filter(element => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.right > viewportWidth + 2;
    });
    if (outside.length > 0) {
        const first = outside[0];
        violations.push({
            rule: 'element-outside-viewport',
            detail: String(outside.length) + ' element(s) extend past the viewport, first: ' + (first?.tagName ?? ''),
            severity: 'medium',
            evidence: describeAll(outside, MAX_EVIDENCE),
        });
    }
    const placeholderOnly = Array.from(root.querySelectorAll('input, textarea')).filter(field => {
        const element = field;
        const hasLabel = element.labels !== null && element.labels.length > 0;
        const hasAria = element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby');
        return element.hasAttribute('placeholder') && !hasLabel && !hasAria;
    });
    if (placeholderOnly.length > 0) {
        violations.push({
            rule: 'placeholder-only-field',
            detail: String(placeholderOnly.length) + ' field(s) rely on a placeholder with no label',
            severity: 'medium',
            evidence: describeAll(placeholderOnly, MAX_EVIDENCE),
        });
    }
    return violations;
}
/**
 * Collect the visual violations of the page's current state.
 * @param page - the page to measure.
 * @returns the violations found, in rule order.
 */
export async function checkVisual(page) {
    // The inspection runs in the page as a serialized function call. Passing the
    // function source as an expression avoids holding a document handle across a
    // possible navigation, which would fail with a destroyed execution context.
    // The narrow evaluator type keeps the signature explicit instead of inferring
    // through Playwright's generic overloads.
    const evaluator = page;
    const expression = '(' + collectViolations.toString() + ')(document)';
    return evaluator.evaluate(expression);
}
