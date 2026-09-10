import type { ReportModel, ReportTest, Regression, RecoveredTest, TrendPoint } from '../report/types.ts';
export interface HistoryProjection {
    trend: readonly TrendPoint[];
    regressions: readonly Regression[];
    recovered: readonly RecoveredTest[];
    tests: readonly ReportTest[];
}
/** Compare a report with prior runs, persist it, and return history-derived fields. */
export declare function projectHistory(path: string, model: ReportModel): Promise<HistoryProjection>;
