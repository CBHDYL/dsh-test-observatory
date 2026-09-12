/**
 * Pure HTML rendering of the Test Observatory report. The reviewed visual
 * design (markup, stylesheet and client script) is carried by the generated
 * asset module; this module binds a ReportModel into it. No I/O, no Cordis,
 * no clock or random: the same model always renders the same document.
 * @module @cbhdyl/dsh-test-observatory/report/render
 */

import { REPORT_BODY, REPORT_OVERLAY, REPORT_SCRIPT, REPORT_STYLE } from './assets.generated.ts'
import type { ReportModel } from './types.ts'

/**
 * Escape the five HTML-significant characters so interpolated user-controlled
 * strings cannot inject markup.
 * @param value - raw string that may contain `< > & \" '`.
 * @returns the string with each significant character replaced by its entity.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Serialize the report model for embedding inside a script element. The JSON
 * is additionally guarded against terminating the script element itself.
 * @param model - the report model to embed.
 * @returns a JSON literal safe to place inside `<script>`.
 */
function embedModel(model: ReportModel): string {
  return JSON.stringify(model).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

/**
 * Remove the experience section from the reviewed markup when the run produced
 * no human-simulation data, so a command-only run shows no empty shells.
 * @param body - the reviewed report body markup.
 * @returns the markup with the experience section removed.
 */
function stripEvidence(body: string): string {
  const start=body.indexOf('<!--EVIDENCE_START-->'),end=body.indexOf('<!--EVIDENCE_END-->')
  if(start===-1||end===-1||end<start)return body
  return body.slice(0,start)+body.slice(end+'<!--EVIDENCE_END-->'.length)
}

function stripExperience(body: string): string {
  const withoutChecks = stripSection(body, 'id="checksSection"')
  const start = withoutChecks.indexOf('<!--XP_START-->')
  const end = withoutChecks.indexOf('<!--XP_END-->')
  if (start === -1 || end === -1 || end < start) return withoutChecks
  return withoutChecks.slice(0, start) + withoutChecks.slice(end + '<!--XP_END-->'.length)
}

/**
 * Remove one top-level section identified by an id attribute, together with
 * its wrapper, when a run produced no data for it.
 * @param body - the reviewed report body markup.
 * @param idAttribute - the exact id attribute text to locate.
 * @returns the markup with that section removed.
 */
function stripSection(body: string, idAttribute: string): string {
  const start = body.indexOf(idAttribute)
  if (start === -1) return body
  const open = body.lastIndexOf('<section', start)
  const close = body.indexOf('</section>', start)
  if (open === -1 || close === -1) return body
  return body.slice(0, open) + body.slice(close + '</section>'.length)
}

/**
 * Drop the navigation buttons whose page is absent from this document. A
 * command-only run has no journeys page and no findings page, and a button
 * that routes to a removed section is a link to nothing.
 * @param body - the reviewed report body markup after section stripping.
 * @returns the markup whose page navigation lists exactly its pages.
 */
function prunePageNav(body: string): string {
  const navStart = body.indexOf('id="pageNav"')
  if (navStart === -1) return body
  const navEnd = body.indexOf('</nav>', navStart)
  if (navEnd === -1) return body
  const present = new Set([...body.matchAll(/data-page="([^"]+)"/g)].map(match => match[1] ?? ''))
  const nav = body.slice(navStart, navEnd).replace(
    /<button[^>]*data-goto="([^"]+)"[^>]*>[^<]*<\/button>/g,
    (whole, page: string) => (present.has(page) ? whole : ''),
  )
  return body.slice(0, navStart) + nav + body.slice(navEnd)
}

/**
 * Render one self-contained report document.
 * @param model - every fact the report shows.
 * @returns a complete HTML5 document with no external resources.
 */
export function renderReport(model: ReportModel): string {
  const title = escapeHtml(model.meta.project + ' — Test Observatory')
  const body = (model.evidence?.length ?? 0) === 0 && (model.findings?.length ?? 0) === 0
    ? stripEvidence(model.experience === undefined ? stripExperience(REPORT_BODY) : REPORT_BODY)
    : model.experience === undefined ? stripExperience(REPORT_BODY) : REPORT_BODY
  return [
    '<!DOCTYPE html>',
    '<html lang=\"en\" data-theme=\"light\"><head><meta charset=\"utf-8\">',
    '<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">',
    '<title>' + title + '</title>',
    '<style>' + REPORT_STYLE + '</style></head><body><div class=\"shell\">',
    prunePageNav(body),
    '<script>window.__OBSERVATORY__=' + embedModel(model) + ';</script>',
    REPORT_OVERLAY,
    '<script>' + REPORT_SCRIPT + '</script>',
    '</body></html>',
  ].join('')
}
