// The capture integrity audit: the executable definition of "this screenshot is
// trustworthy". Every rule is asserted twice — once for the clean case and once
// for the defect it exists to catch — because a check that never fails proves
// nothing.
import { describe, expect, it } from 'vitest'
import { MIN_CAPTURE_BYTES, auditCapture, isTrustworthy } from '../src/experience/integrity.ts'
import type { CaptureFacts } from '../src/experience/integrity.ts'

/**
 * Facts for a clean, viewport-sized capture with one drawn annotation. An
 * override set to `undefined` removes the field entirely, which is how a test
 * states "the measurement was not available".
 */
function clean(overrides: Partial<Record<keyof CaptureFacts, unknown>> = {}): CaptureFacts {
  const facts: Record<string, unknown> = {
    cleanBytes: 50_000,
    annotatedBytes: 51_000,
    drawn: [{ label: 'image-broken', x: 0, y: 0, width: 10, height: 10 }],
    overlayLeftBehind: false,
    expectedWidth: 1440,
    expectedHeight: 900,
    imageWidth: 1440,
    imageHeight: 900,
    ...overrides,
  }
  for (const key of Object.keys(overrides)) if (facts[key] === undefined) delete facts[key]
  return facts as unknown as CaptureFacts
}

describe('auditCapture', () => {
  it('passes a capture that matches the page and carries its annotations', () => {
    expect(auditCapture(clean())).toEqual([])
    expect(isTrustworthy(auditCapture(clean()))).toBe(true)
  })

  it('passes a capture with no annotations at all', () => {
    const facts = clean({ drawn: [], annotatedBytes: undefined })
    expect(auditCapture(facts)).toEqual([])
  })

  it('catches an effectively blank capture', () => {
    const defects = auditCapture(clean({ cleanBytes: MIN_CAPTURE_BYTES - 1 }))
    expect(defects.map(defect => defect.rule)).toEqual(['evidence-too-small'])
  })

  it('catches an overlay the annotator failed to remove', () => {
    const defects = auditCapture(clean({ overlayLeftBehind: true }))
    expect(defects.map(defect => defect.rule)).toEqual(['evidence-overlay-left-behind'])
    expect(defects[0]?.detail).toContain('no longer in the state the checks measured')
  })

  it('catches annotations that were drawn but never captured', () => {
    const defects = auditCapture(clean({ annotatedBytes: undefined }))
    expect(defects.map(defect => defect.rule)).toEqual(['evidence-annotation-missing'])
  })

  it('catches annotations that are absent from the image', () => {
    const defects = auditCapture(clean({ cleanBytes: 50_000, annotatedBytes: 50_000 }))
    expect(defects.map(defect => defect.rule)).toEqual(['evidence-annotation-not-visible'])
  })

  it('catches a capture whose width does not match the page', () => {
    const defects = auditCapture(clean({ imageWidth: 1200 }))
    expect(defects.map(defect => defect.rule)).toEqual(['evidence-size-mismatch'])
    expect(defects[0]?.detail).toContain('1200px wide')
  })

  it('catches a capture whose height does not match the page', () => {
    const defects = auditCapture(clean({ imageHeight: 600 }))
    expect(defects[0]?.detail).toContain('600px tall')
  })

  it('reports several defects at once instead of the first', () => {
    const defects = auditCapture(clean({ cleanBytes: 10, overlayLeftBehind: true, annotatedBytes: undefined }))
    expect(defects.map(defect => defect.rule)).toEqual([
      'evidence-too-small',
      'evidence-overlay-left-behind',
      'evidence-annotation-missing',
    ])
  })

  it('says nothing about image size when the image could not be measured', () => {
    const defects = auditCapture(clean({ imageWidth: undefined, imageHeight: undefined }))
    expect(defects).toEqual([])
  })

  it('treats a capture with any defect as untrustworthy', () => {
    expect(isTrustworthy(auditCapture(clean({ overlayLeftBehind: true })))).toBe(false)
  })
})