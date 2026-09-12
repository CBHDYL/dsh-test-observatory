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
import { execFile } from 'node:child_process';
/** `--abbrev-ref` answers this instead of a branch name when HEAD is detached. */
const DETACHED_HEAD = 'HEAD';
/** How long a single revision query may take before it is treated as unknown. */
const REVISION_TIMEOUT_MS = 5_000;
/**
 * Run one read-only query against the workspace and return its trimmed answer.
 * @param cwd - the directory the run was declared for.
 * @param args - arguments passed to `git -C <cwd>`.
 * @returns the trimmed stdout, or an empty string when git cannot answer.
 */
function revParse(cwd, args) {
    return new Promise((resolve) => {
        execFile('git', ['-C', cwd, ...args], { timeout: REVISION_TIMEOUT_MS, maxBuffer: 64 * 1024 }, (error, stdout) => {
            // A workspace that is not a repository, a missing git, and a repository
            // with no commits are all ordinary answers: the revision is unknown.
            resolve(error === null ? stdout.trim() : '');
        });
    });
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
export async function detectRevision(cwd) {
    const [commit, branch] = await Promise.all([
        revParse(cwd, ['rev-parse', '--short', 'HEAD']),
        revParse(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    ]);
    return { branch: branch === DETACHED_HEAD ? '' : branch, commit };
}
