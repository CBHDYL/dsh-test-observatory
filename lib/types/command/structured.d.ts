import type { ReportTest } from '../report/types.ts';
import type { StructuredResultSpec, SuiteCase } from './types.ts';
/** Read and parse one declared structured result artifact. */
export declare function parseStructuredResult(spec: StructuredResultSpec, testCase: SuiteCase, cwd: string): Promise<ReportTest[]>;
