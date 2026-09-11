import type { ReportTest } from '../report/types.ts';
import type { SnapshotCounts } from './snapshots.ts';
import type { StructuredResultSpec, SuiteCase } from './types.ts';
/** Everything one artifact contributed to the report. */
export interface StructuredResultRead {
    /** Test-level rows the artifact produced. */
    readonly tests: readonly ReportTest[];
    /**
     * Snapshot counts the artifact declared, when it declared any. A snapshot
     * mismatch is otherwise indistinguishable from an ordinary failing test.
     */
    readonly snapshots?: SnapshotCounts;
}
/**
 * Read and parse one declared structured result artifact.
 * @param spec - the declared format and path.
 * @param testCase - the declaring case, supplying suite and owner defaults.
 * @param cwd - the directory the path is resolved against.
 * @returns the rows and any snapshot counts the artifact declared.
 */
export declare function readStructuredResult(spec: StructuredResultSpec, testCase: SuiteCase, cwd: string): Promise<StructuredResultRead>;
/**
 * Read one artifact and return only its rows.
 * @param spec - the declared format and path.
 * @param testCase - the declaring case.
 * @param cwd - the directory the path is resolved against.
 * @returns the test-level rows.
 */
export declare function parseStructuredResult(spec: StructuredResultSpec, testCase: SuiteCase, cwd: string): Promise<ReportTest[]>;
