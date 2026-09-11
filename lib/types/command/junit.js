/** Decode the five XML entities a JUnit document uses. */
function decode(value) {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}
/** Read one attribute from an element's attribute text. */
function attr(attributes, key) {
    const match = new RegExp('\\s' + key + '=["\']([^"\']*)["\']').exec(attributes);
    return match?.[1] === undefined || match[1].length === 0 ? undefined : match[1];
}
/** Strip the CDATA wrapper a failure body may carry. */
function unwrapCdata(value) {
    return value.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
}
/** Whether the document was cut off before its root element closed. */
function isTruncated(source) {
    const opens = (source.match(/<(testsuites?)\b/g) ?? []).length;
    const closes = (source.match(/<\/(testsuites?)>/g) ?? []).length;
    return opens > closes;
}
/**
 * Parse a JUnit document into cases.
 *
 * Case order follows the document, so a report shows the producer's own order.
 * @param source - the document text.
 * @returns every case the document declares.
 * @throws when the document is truncated, because a truncated document cannot be
 *   distinguished from a fully passing one by its cases alone.
 */
export function parseJUnitDocument(source) {
    if (isTruncated(source)) {
        throw new Error('the JUnit document is truncated: its root element never closed, so its cases cannot be trusted');
    }
    const cases = [];
    // An opening tag either closes itself or has a body; both forms are matched.
    for (const match of source.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
        const attributes = match[1] ?? '';
        const body = match[2] ?? '';
        const failure = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(failure|error)>)/.exec(body);
        const name = attr(attributes, 'name');
        if (name === undefined)
            continue;
        const skipped = /<skipped\b/.test(body);
        const status = failure !== null ? 'failed' : skipped ? 'skipped' : 'passed';
        const bodyText = failure?.[3] === undefined ? undefined : unwrapCdata(failure[3]);
        const message = failure === null ? undefined : attr(failure[2] ?? '', 'message');
        const error = bodyText !== undefined && bodyText.length > 0 ? bodyText : message;
        const classname = attr(attributes, 'classname');
        const file = attr(attributes, 'file');
        const time = Number(attr(attributes, 'time'));
        // Surefire, nextest and Pytest's rerun plugin record extra attempts in a
        // sibling element; the count is the attempts, and the outcome is untouched.
        const reruns = (body.match(/<rerunFailure\b|<flakyFailure\b|<rerunError\b|<flakyError\b/g) ?? []).length;
        cases.push({
            name: decode(name),
            ...(classname === undefined ? {} : { classname: decode(classname) }),
            ...(file === undefined ? {} : { file: decode(file) }),
            status,
            ...(Number.isFinite(time) ? { durationSeconds: time } : {}),
            ...(error === undefined ? {} : { error: decode(error) }),
            ...(reruns > 0 ? { attempts: reruns + 1 } : {}),
        });
    }
    return cases;
}
