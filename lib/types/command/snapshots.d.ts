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
/** Snapshot counts one report declares. */
export interface SnapshotCounts {
    /** Cases that matched their stored baseline. */
    readonly matched: number;
    /** Cases whose baseline was written for the first time, or refreshed. */
    readonly added: number;
    /** Cases whose output differs from the stored baseline. */
    readonly unmatched: number;
    /** Cases whose baseline was rewritten because updating was requested. */
    readonly updated: number;
    /**
     * Cases not compared at all. A baseline that was just created lands here, and
     * so does one whose test no longer exists.
     */
    readonly unchecked: number;
    /** Every case the report counted. */
    readonly total: number;
}
/**
 * Read the snapshot counts a report declares.
 * @param value - the parsed report document.
 * @returns the counts, or undefined when the document reports none, which is
 *   how a project with no snapshot tests looks.
 */
export declare function readSnapshotCounts(value: unknown): SnapshotCounts | undefined;
/**
 * Whether any baseline was created or refreshed rather than compared.
 * @param counts - the parsed counts.
 * @returns true when at least one case was not compared.
 */
export declare function hasUnreviewedBaselines(counts: SnapshotCounts): boolean;
/**
 * A one-line statement of what the snapshots did, for a report summary.
 *
 * It states only what the counts support. A baseline that was written is not
 * described as verified, because nothing compared it to anything.
 * @param counts - the parsed counts, or undefined when the report had none.
 * @returns the sentence, or undefined when there is nothing to say.
 */
export declare function describeSnapshots(counts: SnapshotCounts | undefined): string | undefined;
