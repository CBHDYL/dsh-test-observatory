/**
 * The published entry points resolve to `lib/`, whose runtime bundles ship no
 * declarations; those live under `lib/types`. The artifact specs import the
 * built bundle on purpose — that is the only way to observe what the package
 * actually installs — so its module surface is declared once here instead of
 * being re-typed at every call site, and instead of widening `allowJs` to pull
 * a minified bundle through the type checker.
 */
declare module '*/lib/report/index.js' {
  /** Render one self-contained report document from a report model. */
  export function renderReport(model: import('../../src/report/types.ts').ReportModel): string
  /** Escape the five HTML-significant characters. */
  export function escapeHtml(value: string): string
}
