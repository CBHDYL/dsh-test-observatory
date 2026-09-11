import type { ReportModel, ReportTest, Regression, RecoveredTest, TrendPoint } from '../report/types.ts';
/** History-derived report fields. */
export interface HistoryProjection {
    readonly trend: readonly TrendPoint[];
    readonly regressions: readonly Regression[];
    readonly recovered: readonly RecoveredTest[];
    readonly tests: readonly ReportTest[];
}
/** Rows retained on disk, newest last. */
export declare const MAX_RETAINED_RUNS = 20;
/**
 * Compare a report with the previous run, persist it, and return the
 * history-derived fields. The current run's own statuses are returned unchanged.
 * @param path - the history file to read and replace.
 * @param model - the report being written.
 * @returns the trend, the changes since the previous run, and the unchanged tests.
 */
export declare function projectHistory(path: string, model: ReportModel): Promise<HistoryProjection>;
