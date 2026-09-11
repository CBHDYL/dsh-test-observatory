import type { OverlayRect } from './annotate.ts';
/** One integrity problem found in a capture. */
export interface CaptureDefect {
    /** Stable defect id, such as `evidence-too-small`. */
    readonly rule: string;
    /** What was observed, in concrete terms. */
    readonly detail: string;
}
/** Inputs needed to decide whether one capture can be trusted. */
export interface CaptureFacts {
    /** Encoded size of the clean capture in bytes. */
    readonly cleanBytes: number;
    /** Encoded size of the annotated capture in bytes, when annotations were drawn. */
    readonly annotatedBytes?: number;
    /** Regions the annotator reported drawing. */
    readonly drawn: readonly OverlayRect[];
    /** Whether an overlay node was still attached to the page after annotation. */
    readonly overlayLeftBehind: boolean;
    /** Visible page width the capture should match. */
    readonly expectedWidth: number;
    /** Visible page height the capture should match. */
    readonly expectedHeight: number;
    /** Width of the captured image, when it could be measured. */
    readonly imageWidth?: number;
    /** Height of the captured image, when it could be measured. */
    readonly imageHeight?: number;
}
/**
 * One capture that repeats an earlier capture in the same run. Two journeys that
 * open the same page produce byte-identical images; showing both as separate
 * evidence claims two observations where the run made one.
 */
export interface DuplicateEvidence {
    /** Capture that repeats an earlier one. */
    readonly id: string;
    /** The first capture carrying the same image. */
    readonly firstId: string;
}
/**
 * Find captures whose image repeats an earlier capture's image.
 * @param shots - every capture the run made, in capture order.
 * @returns the repeats, each naming the capture it duplicates.
 */
export declare function findDuplicateEvidence(shots: readonly {
    readonly id: string;
    readonly imageDataUri: string;
}[]): readonly DuplicateEvidence[];
/** Smallest capture that is still considered usable evidence. */
export declare const MIN_CAPTURE_BYTES = 1024;
/**
 * Decide whether one capture is trustworthy evidence.
 *
 * A capture with any defect must be shown to the reader as untrusted rather than
 * presented silently, because an unverifiable screenshot is indistinguishable
 * from a correct one at a glance.
 * @param facts - what was measured about the capture.
 * @returns every defect found; an empty list means the capture can be trusted.
 */
export declare function auditCapture(facts: CaptureFacts): readonly CaptureDefect[];
/**
 * Whether a capture carries no integrity defect.
 * @param defects - the defects {@link auditCapture} reported.
 * @returns true when the capture can be trusted.
 */
export declare function isTrustworthy(defects: readonly CaptureDefect[]): boolean;
