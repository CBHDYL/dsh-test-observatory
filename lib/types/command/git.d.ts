/**
 * The revision a run tested.
 *
 * A trend, a regression and a recovery are all claims about two runs of the
 * same revision, and the verdict caps itself when the run cannot say which
 * revision it ran. The workspace is the only place that can answer, so the
 * answer is read from it and an environment that cannot answer says so with
 * empty strings rather than a guess.
 * @module @cbhdyl/dsh-test-observatory/command/git
 */
/** One repository revision: the branch and commit a run tested. */
export interface Revision {
    /** Current branch, empty when the workspace is not on one. */
    readonly branch: string;
    /** Abbreviated commit, empty when the workspace has no revision to report. */
    readonly commit: string;
}
/**
 * Read the revision the workspace is on.
 *
 * A detached HEAD is reported as no branch, because `HEAD` is not a branch a
 * reader can go back to. Both fields are empty when the workspace is not a
 * repository: the run happened, it just cannot be compared with another.
 * @param cwd - the directory the run was declared for.
 * @returns the branch and commit, either empty when they cannot be read.
 */
export declare function detectRevision(cwd: string): Promise<Revision>;
