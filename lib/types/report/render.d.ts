/**
 * Pure HTML rendering of the Test Observatory report. The reviewed visual
 * design (markup, stylesheet and client script) is carried by the generated
 * asset module; this module binds a ReportModel into it. No I/O, no Cordis,
 * no clock or random: the same model always renders the same document.
 * @module @deepseek-ai/dsh-report-observatory/render
 */
import type { ReportModel } from './types.ts';
/**
 * Escape the five HTML-significant characters so interpolated user-controlled
 * strings cannot inject markup.
 * @param value - raw string that may contain `< > & \" '`.
 * @returns the string with each significant character replaced by its entity.
 */
export declare function escapeHtml(value: string): string;
/**
 * Render one self-contained report document.
 * @param model - every fact the report shows.
 * @returns a complete HTML5 document with no external resources.
 */
export declare function renderReport(model: ReportModel): string;
