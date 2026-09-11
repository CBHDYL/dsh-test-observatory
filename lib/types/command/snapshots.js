/**
 * Snapshot counts from a Jest-shaped JSON report.
 *
 * A snapshot failure reaches a report as one failed test among hundreds, and the
 * two situations behind it need opposite responses: a mismatch means a real
 * behavioural change slipped in, while an unchecked entry means a baseline was
 * created or has gone stale — the second is normal right after a merge and the
 * first never is. Naming which happened is the whole point of reading the field.
 *
 * The field names are the ones Jest publishes and Vitest reproduces; they were
 * confirmed against a real Vitest JSON report rather than assumed.
 * @module @cbhdyl/dsh-test-observatory/command/snapshots
 */
/** Read a non-negative integer from an unknown value. */
function count(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
/**
 * Read the snapshot counts a report declares.
 * @param value - the parsed report document.
 * @returns the counts, or undefined when the document reports none, which is
 *   how a project with no snapshot tests looks.
 */
export function readSnapshotCounts(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const raw = value.snapshot;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
        return undefined;
    const record = raw;
    return {
        matched: count(record['matched']),
        added: count(record['added']),
        unmatched: count(record['unmatched']),
        updated: count(record['updated']),
        // Jest reports the stale count both as a total and as per-file keys; the
        // total is the one that answers "did anything go stale".
        unchecked: count(record['unchecked']) + count(record['filesUnmatched']),
        total: count(record['total']),
    };
}
/**
 * Whether any baseline was created or refreshed rather than compared.
 * @param counts - the parsed counts.
 * @returns true when at least one case was not compared.
 */
export function hasUnreviewedBaselines(counts) {
    return counts.added + counts.updated + counts.unchecked > 0;
}
/**
 * A one-line statement of what the snapshots did, for a report summary.
 *
 * It states only what the counts support. A baseline that was written is not
 * described as verified, because nothing compared it to anything.
 * @param counts - the parsed counts, or undefined when the report had none.
 * @returns the sentence, or undefined when there is nothing to say.
 */
export function describeSnapshots(counts) {
    if (counts === undefined || counts.total === 0)
        return undefined;
    const parts = [];
    if (counts.matched > 0)
        parts.push(String(counts.matched) + ' compared');
    if (counts.unmatched > 0)
        parts.push(String(counts.unmatched) + ' did not match');
    if (counts.added > 0)
        parts.push(String(counts.added) + ' written for the first time');
    if (counts.unchecked > 0)
        parts.push(String(counts.unchecked) + ' not compared (a baseline was created, or its test is gone)');
    if (counts.updated > 0)
        parts.push(String(counts.updated) + ' refreshed');
    if (parts.length === 0)
        return undefined;
    return 'Snapshots: ' + parts.join(', ') + '.';
}
