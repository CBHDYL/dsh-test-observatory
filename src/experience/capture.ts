/**
 * Bounded screenshot capture with evidence markings and an integrity verdict.
 *
 * One capture produces up to two images from the same page state: a clean image
 * and, when a finding's region was measured, a marked image. The clean image is
 * what the integrity audit reasons about and what a reader can compare against,
 * so a mark can never be mistaken for something the page rendered.
 * @module @cbhdyl/dsh-test-observatory/experience/capture
 */
import type { Page } from 'playwright-core'
import { annotate, overlayPresent } from './annotate.ts'
import type { Annotation } from './annotate.ts'
import { auditCapture } from './integrity.ts'
import type { CaptureDefect } from './integrity.ts'
import { maskDynamic } from './mask.ts'

/** Bound on one captured image's encoded size, so the report stays openable. */
export const MAX_SHOT_BYTES = 400_000

/** Quality ladder tried in order until an image fits {@link MAX_SHOT_BYTES}. */
const ENCODINGS: readonly { readonly type: 'png' | 'jpeg'; readonly quality?: number }[] = [
  { type: 'png' },
  { type: 'jpeg', quality: 70 },
  { type: 'jpeg', quality: 45 },
  { type: 'jpeg', quality: 25 },
]

/** One capture attempt's encoded result. */
interface Encoded {
  /** The data URI, or undefined when even the smallest encoding exceeded the bound. */
  readonly dataUri?: string
  /** Encoded byte length of the produced image. */
  readonly bytes: number
}

/** A page's declared viewport, as the capture should reproduce it. */
export interface ViewportFacts {
  /** Visible width in CSS pixels. */
  readonly width: number
  /** Visible height in CSS pixels. */
  readonly height: number
}

/** The result of one evidence capture. */
export interface CaptureResult {
  /** Clean image as a data URI, absent when nothing could be encoded within the bound. */
  readonly clean?: string
  /** Marked image as a data URI, present only when annotations were drawn. */
  readonly annotated?: string
  /** Integrity defects; any entry means the capture must be shown as untrusted. */
  readonly defects: readonly CaptureDefect[]
}

/**
 * Encode the page within the size bound, degrading quality rather than dropping
 * the evidence a human needs to judge the finding.
 * @param page - the page to encode.
 * @returns the encoded image and its byte length.
 */
async function encode(page: Page): Promise<Encoded> {
  let smallest = 0
  for (const attempt of ENCODINGS) {
    const options: { type: 'png' | 'jpeg'; quality?: number } = { type: attempt.type }
    if (attempt.quality !== undefined) options.quality = attempt.quality
    const buffer = await page.screenshot(options)
    smallest = buffer.byteLength
    if (buffer.byteLength <= MAX_SHOT_BYTES) {
      const mime = attempt.type === 'png' ? 'image/png' : 'image/jpeg'
      return { dataUri: 'data:' + mime + ';base64,' + buffer.toString('base64'), bytes: buffer.byteLength }
    }
  }
  return { bytes: smallest }
}

/**
 * Measure the page's visible size.
 * @param page - the page to measure.
 * @returns the viewport the capture should reproduce.
 */
async function measureViewport(page: Page): Promise<ViewportFacts> {
  const evaluator = page as unknown as {
    evaluate: (expression: unknown) => Promise<ViewportFacts>
  }
  return await evaluator.evaluate((): ViewportFacts => ({ width: window.innerWidth, height: window.innerHeight }))
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
export async function captureEvidence(page: Page, annotations: readonly Annotation[] = [], masks: readonly string[] = []): Promise<CaptureResult> {
  const mask = await maskDynamic(page, masks)
  try {
    return await captureMasked(page, annotations)
  } finally {
    await mask.restore()
  }
}

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
export async function captureElement(page: Page, selector: string): Promise<CaptureResult> {
  const target = page.locator(selector).first()
  await target.waitFor({ state: 'visible', timeout: 5_000 })
  const box = await target.boundingBox()
  if (box === null) throw new Error('screenshot target ' + JSON.stringify(selector) + ' has no layout box')
  let bytes = await target.screenshot({ type: 'png' })
  let mime = 'image/png'
  for (const quality of [80, 60, 40]) {
    if (bytes.byteLength <= MAX_SHOT_BYTES) break
    bytes = await target.screenshot({ type: 'jpeg', quality })
    mime = 'image/jpeg'
  }
  const defects = auditCapture({
    cleanBytes: bytes.byteLength,
    drawn: [],
    overlayLeftBehind: false,
    expectedWidth: Math.round(box.width),
    expectedHeight: Math.round(box.height),
  })
  if (bytes.byteLength > MAX_SHOT_BYTES) {
    return { defects: [...defects, { rule: 'evidence-too-large', detail: 'the element capture is ' + String(bytes.byteLength) + ' bytes, above the ' + String(MAX_SHOT_BYTES) + '-byte bound' }] }
  }
  return { clean: 'data:' + mime + ';base64,' + bytes.toString('base64'), defects }
}

async function captureMasked(page: Page, annotations: readonly Annotation[]): Promise<CaptureResult> {
  const viewport = await measureViewport(page)
  const clean = await encode(page)
  if (clean.dataUri === undefined) {
    // Nothing could be encoded within the bound, so the smallest attempt's size
    // is what the reader is told about.
    return {
      defects: [{ rule: 'evidence-too-small', detail: 'no encoding of the page fitted the ' + String(MAX_SHOT_BYTES) + '-byte bound; the smallest was ' + String(clean.bytes) + ' bytes' }],
    }
  }
  if (annotations.length === 0) {
    return {
      clean: clean.dataUri,
      defects: auditCapture({
        cleanBytes: clean.bytes,
        drawn: [],
        overlayLeftBehind: false,
        expectedWidth: viewport.width,
        expectedHeight: viewport.height,
      }),
    }
  }
  const overlay = await annotate(page, annotations)
  if (overlay.drawn.length === 0) {
    // Nothing could be drawn in this coordinate space, so there is no second
    // image to take and no overlay to clean up.
    await overlay.remove()
    return {
      clean: clean.dataUri,
      defects: auditCapture({
        cleanBytes: clean.bytes,
        drawn: [],
        overlayLeftBehind: await overlayPresent(page),
        expectedWidth: viewport.width,
        expectedHeight: viewport.height,
      }),
    }
  }
  let annotated: Encoded | undefined
  let leftBehind = false
  try {
    annotated = await encode(page)
  } finally {
    await overlay.remove()
    leftBehind = await overlayPresent(page)
  }
  const defects = auditCapture({
    cleanBytes: clean.bytes,
    ...(annotated?.dataUri === undefined ? {} : { annotatedBytes: annotated.bytes }),
    drawn: overlay.drawn,
    overlayLeftBehind: leftBehind,
    expectedWidth: viewport.width,
    expectedHeight: viewport.height,
  })
  return {
    clean: clean.dataUri,
    ...(annotated?.dataUri === undefined ? {} : { annotated: annotated.dataUri }),
    defects,
  }
}
