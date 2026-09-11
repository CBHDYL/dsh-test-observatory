/** Smallest capture that is still considered usable evidence. */
export const MIN_CAPTURE_BYTES = 1024;
/**
 * Decide whether one capture is trustworthy evidence.
 *
 * A capture with any defect must be shown to the reader as untrusted rather than
 * presented silently, because an unverifiable screenshot is indistinguishable
 * from a correct one at a glance.
 * @param facts - what was measured about the capture.
 * @returns every defect found; an empty list means the capture can be trusted.
 */
export function auditCapture(facts) {
    const defects = [];
    if (facts.cleanBytes < MIN_CAPTURE_BYTES) {
        defects.push({
            rule: 'evidence-too-small',
            detail: 'the capture is ' + String(facts.cleanBytes) + ' bytes, below the ' + String(MIN_CAPTURE_BYTES) + '-byte floor, so it is probably blank',
        });
    }
    if (facts.overlayLeftBehind) {
        defects.push({
            rule: 'evidence-overlay-left-behind',
            detail: 'an annotation overlay was still attached after capture, so the page is no longer in the state the checks measured',
        });
    }
    if (facts.drawn.length > 0 && facts.annotatedBytes === undefined) {
        defects.push({
            rule: 'evidence-annotation-missing',
            detail: String(facts.drawn.length) + ' annotation(s) were drawn but no annotated capture was produced',
        });
    }
    if (facts.drawn.length > 0 && facts.annotatedBytes !== undefined && facts.annotatedBytes === facts.cleanBytes) {
        defects.push({
            rule: 'evidence-annotation-not-visible',
            detail: 'the annotated capture is byte-identical to the clean one, so the annotations are not in the image',
        });
    }
    const width = facts.imageWidth;
    const height = facts.imageHeight;
    if (width !== undefined && width !== facts.expectedWidth) {
        defects.push({
            rule: 'evidence-size-mismatch',
            detail: 'the capture is ' + String(width) + 'px wide but the page reported ' + String(facts.expectedWidth) + 'px',
        });
    }
    if (height !== undefined && height !== facts.expectedHeight) {
        defects.push({
            rule: 'evidence-size-mismatch',
            detail: 'the capture is ' + String(height) + 'px tall but the page reported ' + String(facts.expectedHeight) + 'px',
        });
    }
    return defects;
}
/**
 * Whether a capture carries no integrity defect.
 * @param defects - the defects {@link auditCapture} reported.
 * @returns true when the capture can be trusted.
 */
export function isTrustworthy(defects) {
    return defects.length === 0;
}
