/**
 * JUnit XML parsing.
 *
 * There is no official specification for this format — its own ecosystem says so
 * — and every producer emits a different dialect. The differences that change a
 * result are handled here rather than assumed away:
 *
 * - The root element is `<testsuite>` from Surefire and `<testsuites>` from
 *   nextest and most others, so both are walked.
 * - Passing is encoded by the *absence* of a child element, which means a
 *   truncated file reads as an entirely passing run. A truncated document is
 *   therefore an error, never a green run.
 * - A failure may be self-closing (`<failure message="..."/>`), which is what
 *   Pytest emits, so an opening tag is not required to have a body.
 * - Rerun dialects record extra attempts beside the result; they are read as
 *   attempts, not folded into the outcome.
 * - Counts are declared as strings and are not trusted: the cases are counted.
 * @module @cbhdyl/dsh-test-observatory/command/junit
 */
import type { TestStatus } from '../report/types.ts';
/** One case parsed from a JUnit document. */
export interface JUnitCase {
    /** Case name. */
    readonly name: string;
    /** Declared class or suite, when present. */
    readonly classname?: string;
    /** Declared file, when the dialect reports one. */
    readonly file?: string;
    /** Settled status. */
    readonly status: TestStatus;
    /** Duration in seconds, when reported. */
    readonly durationSeconds?: number;
    /** Failure or error text, when the case did not pass. */
    readonly error?: string;
    /** Attempts the document records, when it records more than one. */
    readonly attempts?: number;
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
export declare function parseJUnitDocument(source: string): JUnitCase[];
