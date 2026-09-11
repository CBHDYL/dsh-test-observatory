/**
 * Bounded screenshot capture with evidence markings and an integrity verdict.
 *
 * One capture produces up to two images from the same page state: a clean image
 * and, when a finding's region was measured, a marked image. The clean image is
 * what the integrity audit reasons about and what a reader can compare against,
 * so a mark can never be mistaken for something the page rendered.
 * @module @deepseek-ai/dsh-experience-runner/capture
 */
import type { Page } from 'playwright-core';
import type { Annotation } from './annotate.ts';
import type { CaptureDefect } from './integrity.ts';
/** Bound on one captured image's encoded size, so the report stays openable. */
export declare const MAX_SHOT_BYTES = 400000;
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
