/**
 * Evidence integrity: the checks that make "this screenshot is trustworthy" a
 * statement the report can support rather than an assumption.
 *
 * Two questions are answered separately and never conflated:
 * 1. Is the image a faithful capture of what the browser rendered then?
 * 2. Is the interface itself correct?
 * This module answers only the first. The second needs a reviewed baseline and
 * a human, and is therefore out of scope here.
 * @module @deepseek-ai/dsh-experience-runner/integrity
 */
import type { OverlayRect } from './annotate.ts'

/** One integrity problem found in a capture. */
export interface CaptureDefect {
  /** Stable defect id, such as `evidence-too-small`. */
  readonly rule: string
  /** What was observed, in concrete terms. */
  readonly detail: string
}

/** Inputs needed to decide whether one capture can be trusted. */
export interface CaptureFacts {
  /** Encoded size of the clean capture in bytes. */
  readonly cleanBytes: number
  /** Encoded size of the annotated capture in bytes, when annotations were drawn. */
  readonly annotatedBytes?: number
  /** Regions the annotator reported drawing. */
  readonly drawn: readonly OverlayRect[]
  /** Whether an overlay node was still attached to the page after annotation. */
  readonly overlayLeftBehind: boolean
  /** Visible page width the capture should match. */
  readonly expectedWidth: number
  /** Visible page height the capture should match. */
  readonly expectedHeight: number
  /** Width of the captured image, when it could be measured. */
  readonly imageWidth?: number
  /** Height of the captured image, when it could be measured. */
  readonly imageHeight?: number
}

/** Smallest capture that is still considered usable evidence. */
export const MIN_CAPTURE_BYTES = 1024

/**
 * Decide whether one capture is trustworthy evidence.
 *
 * A capture with any defect must be shown to the reader as untrusted rather than
 * presented silently, because an unverifiable screenshot is indistinguishable
 * from a correct one at a glance.
 * @param facts - what was measured about the capture.
 * @returns every defect found; an empty list means the capture can be trusted.
 */
export function auditCapture(facts: CaptureFacts): readonly CaptureDefect[] {
  const defects: CaptureDefect[] = []
  if (facts.cleanBytes < MIN_CAPTURE_BYTES) {
    defects.push({
      rule: 'evidence-too-small',
      detail: 'the capture is ' + String(facts.cleanBytes) + ' bytes, below the ' + String(MIN_CAPTURE_BYTES) + '-byte floor, so it is probably blank',
    })
  }
  if (facts.overlayLeftBehind) {
    defects.push({
      rule: 'evidence-overlay-left-behind',
      detail: 'an annotation overlay was still attached after capture, so the page is no longer in the state the checks measured',
    })
  }
  if (facts.drawn.length > 0 && facts.annotatedBytes === undefined) {
    defects.push({
      rule: 'evidence-annotation-missing',
      detail: String(facts.drawn.length) + ' annotation(s) were drawn but no annotated capture was produced',
    })
  }
  if (facts.drawn.length > 0 && facts.annotatedBytes !== undefined && facts.annotatedBytes === facts.cleanBytes) {
    defects.push({
      rule: 'evidence-annotation-not-visible',
      detail: 'the annotated capture is byte-identical to the clean one, so the annotations are not in the image',
    })
  }
  const width = facts.imageWidth
  const height = facts.imageHeight
  if (width !== undefined && width !== facts.expectedWidth) {
    defects.push({
      rule: 'evidence-size-mismatch',
      detail: 'the capture is ' + String(width) + 'px wide but the page reported ' + String(facts.expectedWidth) + 'px',
    })
  }
  if (height !== undefined && height !== facts.expectedHeight) {
    defects.push({
      rule: 'evidence-size-mismatch',
      detail: 'the capture is ' + String(height) + 'px tall but the page reported ' + String(facts.expectedHeight) + 'px',
    })
  }
  return defects
}

/**
 * Whether a capture carries no integrity defect.
 * @param defects - the defects {@link auditCapture} reported.
 * @returns true when the capture can be trusted.
 */
export function isTrustworthy(defects: readonly CaptureDefect[]): boolean {
  return defects.length === 0
}
