/**
 * Evidence integrity: the checks that make "this screenshot is trustworthy" a
 * statement the report can support rather than an assumption.
 *
 * Two questions are answered separately and never conflated:
 * 1. Is the image a faithful capture of what the browser rendered then?
 * 2. Is the interface itself correct?
 * This module answers only the first. The second needs a reviewed baseline and
 * a human, and is therefore out of scope here.
 * @module @cbhdyl/dsh-test-observatory/experience/integrity
 */
import { createHash } from 'node:crypto';
/**
 * Find captures whose image repeats an earlier capture's image.
 * @param shots - every capture the run made, in capture order.
 * @returns the repeats, each naming the capture it duplicates.
 */
export function findDuplicateEvidence(shots) {
    const seen = new Map();
    const duplicates = [];
    for (const shot of shots) {
        const digest = createHash('sha256').update(shot.imageDataUri).digest('hex');
        const first = seen.get(digest);
        if (first === undefined)
            seen.set(digest, shot.id);
        else
            duplicates.push({ id: shot.id, firstId: first });
    }
    return duplicates;
}
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
