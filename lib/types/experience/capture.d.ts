/**
 * Bounded screenshot capture with evidence markings and an integrity verdict.
 *
 * One capture produces up to two images from the same page state: a clean image
 * and, when a finding's region was measured, a marked image. The clean image is
 * what the integrity audit reasons about and what a reader can compare against,
 * so a mark can never be mistaken for something the page rendered.
 * @module @cbhdyl/dsh-test-observatory/experience/capture
 */
import type { Page } from 'playwright-core';
import type { Annotation } from './annotate.ts';
import type { CaptureDefect } from './integrity.ts';
import type { ElementEvidence } from './geometry.ts';
/** Bound on one captured image's encoded size, so the report stays openable. */
export declare const MAX_SHOT_BYTES = 400000;
/** Padding around a finding's elements, so the crop shows what surrounds them. */
export declare const CROP_PADDING = 24;
/** Largest crop kept for one finding; a bigger one is re-encoded rather than dropped. */
export declare const MAX_CROP_BYTES = 120000;
/** Findings one page illustrates; a scan can report more than a reader will study. */
export declare const MAX_FINDING_CROPS = 12;
/**
 * Smallest crop worth showing. A 22-pixel input is still the thing that is
 * wrong, so this floor only rejects a sliver, not a small control.
 */
export declare const MIN_CROP_PX = 40;
/** Share of a captured region that must carry content for the capture to stand alone. */
export declare const MIN_INK_SHARE = 0.25;
/** A page's declared viewport, as the capture should reproduce it. */
export interface ViewportFacts {
    /** Visible width in CSS pixels. */
    readonly width: number;
    /** Visible height in CSS pixels. */
    readonly height: number;
}
/** The result of one evidence capture. */
export interface CaptureResult {
    /** Clean image as a data URI, absent when nothing could be encoded within the bound. */
    readonly clean?: string;
    /** Marked image as a data URI, present only when annotations were drawn. */
    readonly annotated?: string;
    /** Integrity defects; any entry means the capture must be shown as untrusted. */
    readonly defects: readonly CaptureDefect[];
    /**
     * What the capture chose to show, when it did not show the whole viewport.
     * Stated so a reader can tell a focused capture from a full-screen one.
     */
    readonly focus?: string;
}
/**
 * Capture the page's current state as evidence.
 *
 * Order matters: annotations are injected only after the clean image exists and
 * are removed before this function returns, so a page check can never observe
 * the marks, and the marked image is the only one that contains them.
 * @param page - the page to capture.
 * @param annotations - regions to mark on the second image.
 * @param masks - selectors of dynamic regions to hide for every image.
 * @returns the images and the integrity verdict for this capture.
 */
export declare function captureEvidence(page: Page, annotations?: readonly Annotation[], masks?: readonly string[]): Promise<CaptureResult>;
/**
 * Capture the page while the caller holds any masking in place.
 * @param page - the page to capture.
 * @param annotations - regions to mark on the second image.
 * @returns the images and the integrity verdict.
 */
/**
 * Capture one element instead of the viewport. A sparse page renders mostly
 * empty space, so an unfocused capture shows a reader almost nothing; the
 * element the step is about is the evidence the step was meant to produce.
 * @param page - the page to capture from.
 * @param selector - the element to capture.
 * @returns the encoded image and its integrity defects.
 * @throws when the element never becomes visible or has no layout box.
 */
export declare function captureElement(page: Page, selector: string): Promise<CaptureResult>;
/**
 * Capture one picture per finding, showing the elements that finding measured.
 *
 * A whole-page screenshot of a finding says only that something is wrong
 * somewhere on the page. The crop is the finding's own evidence: the boxes the
 * check measured, with enough around them to place them.
 * @param page - the page the findings were measured on.
 * @param findings - the findings to illustrate, in report order.
 * @returns one data URI per finding, in the same order, undefined where none could be taken.
 */
export declare function captureFindingCrops(page: Page, findings: readonly {
    readonly evidence?: readonly ElementEvidence[];
}[]): Promise<readonly (string | undefined)[]>;
/**
 * Capture the densest region of the page instead of the whole viewport, so a
 * sparse screen still yields evidence a reader can use. Falls back to nothing
 * when the page has no distinct region, and the caller captures the viewport.
 * @param page - the page to capture from.
 * @returns the encoded region and its integrity defects.
 */
export declare function captureFocused(page: Page): Promise<CaptureResult & {
    focus?: string;
}>;
