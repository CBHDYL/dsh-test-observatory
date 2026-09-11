import { focusRegion } from "./focus.js";
import { annotate, overlayPresent } from "./annotate.js";
import { auditCapture } from "./integrity.js";
import { maskDynamic } from "./mask.js";
/** Bound on one captured image's encoded size, so the report stays openable. */
export const MAX_SHOT_BYTES = 400_000;
/** Padding around a finding's elements, so the crop shows what surrounds them. */
export const CROP_PADDING = 24;
/** Largest crop kept for one finding; a bigger one is re-encoded rather than dropped. */
export const MAX_CROP_BYTES = 120_000;
/** Findings one page illustrates; a scan can report more than a reader will study. */
export const MAX_FINDING_CROPS = 12;
/**
 * Smallest crop worth showing. A 22-pixel input is still the thing that is
 * wrong, so this floor only rejects a sliver, not a small control.
 */
export const MIN_CROP_PX = 40;
/** Share of a captured region that must carry content for the capture to stand alone. */
export const MIN_INK_SHARE = 0.25;
/** Quality ladder tried in order until an image fits {@link MAX_SHOT_BYTES}. */
const ENCODINGS = [
    { type: 'png' },
    { type: 'jpeg', quality: 70 },
    { type: 'jpeg', quality: 45 },
    { type: 'jpeg', quality: 25 },
];
/**
 * Encode the page within the size bound, degrading quality rather than dropping
 * the evidence a human needs to judge the finding.
 * @param page - the page to encode.
 * @returns the encoded image and its byte length.
 */
async function encode(page) {
    let smallest = 0;
    for (const attempt of ENCODINGS) {
        const options = { type: attempt.type };
        if (attempt.quality !== undefined)
            options.quality = attempt.quality;
        const buffer = await page.screenshot(options);
        smallest = buffer.byteLength;
        if (buffer.byteLength <= MAX_SHOT_BYTES) {
            const mime = attempt.type === 'png' ? 'image/png' : 'image/jpeg';
            return { dataUri: 'data:' + mime + ';base64,' + buffer.toString('base64'), bytes: buffer.byteLength };
        }
    }
    return { bytes: smallest };
}
/**
 * Measure the page's visible size.
 * @param page - the page to measure.
 * @returns the viewport the capture should reproduce.
 */
async function measureViewport(page) {
    const evaluator = page;
    return await evaluator.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
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
export async function captureEvidence(page, annotations = [], masks = []) {
    const mask = await maskDynamic(page, masks);
    try {
        return await captureMasked(page, annotations);
    }
    finally {
        await mask.restore();
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
export async function captureElement(page, selector) {
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible', timeout: 5_000 });
    const box = await target.boundingBox();
    if (box === null)
        throw new Error('screenshot target ' + JSON.stringify(selector) + ' has no layout box');
    let bytes = await target.screenshot({ type: 'png' });
    let mime = 'image/png';
    for (const quality of [80, 60, 40]) {
        if (bytes.byteLength <= MAX_SHOT_BYTES)
            break;
        bytes = await target.screenshot({ type: 'jpeg', quality });
        mime = 'image/jpeg';
    }
    const defects = auditCapture({
        cleanBytes: bytes.byteLength,
        drawn: [],
        overlayLeftBehind: false,
        expectedWidth: Math.round(box.width),
        expectedHeight: Math.round(box.height),
    });
    if (bytes.byteLength > MAX_SHOT_BYTES) {
        return { defects: [...defects, { rule: 'evidence-too-large', detail: 'the element capture is ' + String(bytes.byteLength) + ' bytes, above the ' + String(MAX_SHOT_BYTES) + '-byte bound' }] };
    }
    return { clean: 'data:' + mime + ';base64,' + bytes.toString('base64'), defects };
}
/**
 * One box covering every element a finding measured.
 * @param boxes - the measured rectangles of the finding's elements.
 * @param viewport - visible page size, so the crop stays inside the page.
 * @returns the padded box, or undefined when no element was measured.
 */
function unionBox(boxes, viewport) {
    // Only viewport-space boxes share an origin with the clip rectangle; a
    // full-page box is measured from the document top and would drag the union
    // to the wrong place.
    const measured = boxes.filter(box => box.width > 0 && box.height > 0 && box.space === 'viewport');
    if (measured.length === 0)
        return undefined;
    const left = Math.max(0, Math.min(...measured.map(box => box.x)) - CROP_PADDING);
    const top = Math.max(0, Math.min(...measured.map(box => box.y)) - CROP_PADDING);
    const right = Math.min(viewport.width, Math.max(...measured.map(box => box.x + box.width)) + CROP_PADDING);
    const bottom = Math.min(viewport.height, Math.max(...measured.map(box => box.y + box.height)) + CROP_PADDING);
    if (right - left < MIN_CROP_PX || bottom - top < MIN_CROP_PX)
        return undefined;
    return { x: left, y: top, width: right - left, height: bottom - top };
}
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
export async function captureFindingCrops(page, findings) {
    // The viewport is only used to clamp the crop inside the page. A page that
    // cannot report one still yields the finding itself, so the default stands in
    // rather than failing the whole scan.
    let viewport = { width: 1280, height: 720 };
    try {
        viewport = page.viewportSize() ?? viewport;
    }
    catch {
        // A closed or detached page cannot report its size; the default clamps.
    }
    const crops = [];
    for (let index = 0; index < findings.length; index += 1) {
        const finding = findings[index];
        if (index >= MAX_FINDING_CROPS || finding?.evidence === undefined) {
            crops.push(undefined);
            continue;
        }
        const box = unionBox(finding.evidence.map(entry => entry.box), viewport);
        if (box === undefined) {
            crops.push(undefined);
            continue;
        }
        try {
            let bytes = await page.screenshot({ type: 'png', clip: box });
            let mime = 'image/png';
            if (bytes.byteLength > MAX_CROP_BYTES) {
                bytes = await page.screenshot({ type: 'jpeg', quality: 60, clip: box });
                mime = 'image/jpeg';
            }
            crops.push(bytes.byteLength > MAX_CROP_BYTES ? undefined : 'data:' + mime + ';base64,' + bytes.toString('base64'));
        }
        catch {
            // A crop is an illustration, not evidence of correctness; a page that
            // cannot be captured still reports the finding itself.
            crops.push(undefined);
        }
    }
    return crops;
}
/**
 * Capture the densest region of the page instead of the whole viewport, so a
 * sparse screen still yields evidence a reader can use. Falls back to nothing
 * when the page has no distinct region, and the caller captures the viewport.
 * @param page - the page to capture from.
 * @returns the encoded region and its integrity defects.
 */
export async function captureFocused(page) {
    const region = await focusRegion(page);
    if (region === undefined)
        return { defects: [] };
    let bytes = await page.screenshot({ type: 'png', clip: { x: region.x, y: region.y, width: region.width, height: region.height } });
    let mime = 'image/png';
    if (bytes.byteLength > MAX_SHOT_BYTES) {
        bytes = await page.screenshot({ type: 'jpeg', quality: 60, clip: { x: region.x, y: region.y, width: region.width, height: region.height } });
        mime = 'image/jpeg';
    }
    const defects = auditCapture({
        cleanBytes: bytes.byteLength,
        drawn: [],
        overlayLeftBehind: false,
        expectedWidth: region.width,
        expectedHeight: region.height,
    });
    const lowContent = region.inkShare < MIN_INK_SHARE
        ? [{ rule: 'evidence-low-content', detail: 'only ' + String(Math.round(region.inkShare * 100)) + '% of the captured region carries content, so the page is mostly empty space' }]
        : [];
    // A capture that stays above the bound is dropped, not embedded: the report
    // has to keep its size, and an oversized image is not evidence a reader can use.
    if (bytes.byteLength > MAX_SHOT_BYTES) {
        return { defects: [...defects, ...lowContent, { rule: 'evidence-too-large', detail: 'the focused capture is ' + String(bytes.byteLength) + ' bytes at every quality, above the ' + String(MAX_SHOT_BYTES) + '-byte bound' }], focus: region.reason };
    }
    return { clean: 'data:' + mime + ';base64,' + bytes.toString('base64'), defects: [...defects, ...lowContent], focus: region.reason };
}
async function captureMasked(page, annotations) {
    const viewport = await measureViewport(page);
    const clean = await encode(page);
    if (clean.dataUri === undefined) {
        // Nothing could be encoded within the bound, so the smallest attempt's size
        // is what the reader is told about.
        return {
            defects: [{ rule: 'evidence-too-small', detail: 'no encoding of the page fitted the ' + String(MAX_SHOT_BYTES) + '-byte bound; the smallest was ' + String(clean.bytes) + ' bytes' }],
        };
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
        };
    }
    const overlay = await annotate(page, annotations);
    if (overlay.drawn.length === 0) {
        // Nothing could be drawn in this coordinate space, so there is no second
        // image to take and no overlay to clean up.
        await overlay.remove();
        return {
            clean: clean.dataUri,
            defects: auditCapture({
                cleanBytes: clean.bytes,
                drawn: [],
                overlayLeftBehind: await overlayPresent(page),
                expectedWidth: viewport.width,
                expectedHeight: viewport.height,
            }),
        };
    }
    let annotated;
    let leftBehind = false;
    try {
        annotated = await encode(page);
    }
    finally {
        await overlay.remove();
        leftBehind = await overlayPresent(page);
    }
    const defects = auditCapture({
        cleanBytes: clean.bytes,
        ...(annotated?.dataUri === undefined ? {} : { annotatedBytes: annotated.bytes }),
        drawn: overlay.drawn,
        overlayLeftBehind: leftBehind,
        expectedWidth: viewport.width,
        expectedHeight: viewport.height,
    });
    return {
        clean: clean.dataUri,
        ...(annotated?.dataUri === undefined ? {} : { annotated: annotated.dataUri }),
        defects,
    };
}
