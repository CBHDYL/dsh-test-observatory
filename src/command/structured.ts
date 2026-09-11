/** Parse framework artifacts into report-level test results. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ApiObservation, PerformanceObservation, ReportTest, TestAttachment, TestStatus } from '../report/types.ts'
import { parseJUnitDocument } from './junit.ts'
import { parseSarif } from './sarif.ts'
import { readSnapshotCounts } from './snapshots.ts'
import type { SnapshotCounts } from './snapshots.ts'
import type { StructuredResultSpec, SuiteCase } from './types.ts'

interface ParsedCase { name: string; path?: string; suite?: string; status: TestStatus; durationSeconds?: number; error?: string; attempts?: number; attachments?: readonly TestAttachment[]; api?: ApiObservation; performance?: PerformanceObservation }

const text = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined
const number = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const record = (value: unknown): Record<string, unknown> | undefined => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const array = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : []
const status = (value: unknown): TestStatus => {
  const normalized = String(value ?? '').toLowerCase()
  if (normalized.includes('skip') || normalized === 'pending' || normalized === 'disabled' || normalized === 'todo') return 'skipped'
  if (normalized.includes('flaky')) return 'flaky'
  if (normalized === 'passed' || normalized === 'pass' || normalized === 'ok' || normalized === 'expected') return 'passed'
  return 'failed'
}

function parsePlaywright(value: unknown, out: ParsedCase[], inherited = '', inheritedFile?: string): void {
  const item = record(value)
  if (!item) { for (const child of array(value)) parsePlaywright(child, out, inherited, inheritedFile); return }
  const title = text(item['title']) ?? text(item['name'])
  const nextSuite = title === undefined ? inherited : inherited.length === 0 ? title : inherited + ' › ' + title
  const currentFile = text(item['file']) ?? inheritedFile
  const tests = array(item['tests'])
  for (const rawTest of tests) {
    const test = record(rawTest); if (!test) continue
    const results = array(test['results']).map(record).filter((result): result is Record<string, unknown> => result !== undefined)
    const last = results.at(-1)
    const states = results.map(result => status(result['status']))
    const finalStatus: TestStatus = states.at(-1) === 'passed' && states.some(state => state === 'failed') ? 'flaky' : status(test['status'] ?? last?.['status'])
    const errors = array(last?.['errors']).map(error => text(record(error)?.['message']) ?? text(error)).filter((error): error is string => error !== undefined)
    const allAttachments = results.flatMap(result => array(result['attachments']))
    const attachments = allAttachments.flatMap(raw => { const attachment=record(raw); const path=text(attachment?.['path']); if (!path) return []; const contentType=text(attachment?.['contentType']) ?? ''; const kind: TestAttachment['kind']=contentType.startsWith('image/')?'screenshot':contentType.startsWith('video/')?'video':path.endsWith('.zip')?'trace':'other'; return [{ name:text(attachment?.['name']) ?? path.split('/').pop() ?? 'attachment', kind, path }] })
    const duration = (number(last?.['duration']) ?? 0) / 1000
    out.push({ name:title ?? text(test['title']) ?? 'unnamed test', suite:inherited, status:finalStatus, durationSeconds:duration, attempts:Math.max(1, results.length), ...(currentFile ? { path: currentFile } : {}), ...(errors.length ? { error:errors.join('\n') } : {}), ...(attachments.length ? { attachments } : {}) })
  }
  for (const key of ['suites', 'specs']) for (const child of array(item[key])) parsePlaywright(child, out, nextSuite, currentFile)
}

function visit(value: unknown, framework: StructuredResultSpec['format'], out: ParsedCase[], inherited = '', inheritedFile?: string): void {
  const item = record(value); if (!item) { for (const child of array(value)) visit(child, framework, out, inherited, inheritedFile); return }
  const title = text(item['fullName']) ?? text(item['title']) ?? text(item['name'])
  const location = record(item['location'])
  const ownFile = text(item['file']) ?? text(item['filePath']) ?? text(location?.['file'])
  const file = ownFile ?? inheritedFile ?? (framework === 'jest' || framework === 'vitest' ? text(item['name']) : undefined)
  const state = item['status'] ?? item['state'] ?? item['outcome']
  const durationMs = number(item['duration']) ?? number(record(item['duration'])?.['milliseconds'])
  const errors = [...array(item['errors']), ...array(item['failureMessages'])].map(x => text(record(x)?.['message']) ?? text(x)).filter((x): x is string => x !== undefined)
  const directError = text(item['failureMessage']) ?? text(item['error']) ?? (errors.length === 0 ? undefined : errors.join('\n'))
  const attempts = array(item['results']).length || number(item['retry'])
  const attachments = array(item['attachments']).flatMap(raw => { const a=record(raw); const path=text(a?.['path']); if(!path)return []; const contentType=text(a?.['contentType'])??''; const kind: TestAttachment['kind']=contentType.startsWith('image/')?'screenshot':contentType.startsWith('video/')?'video':path.endsWith('.zip')?'trace':'other'; return [{name:text(a?.['name'])??path.split('/').pop()??'attachment',kind,path}] })
  const childKeys = ['testResults', 'assertionResults', 'suites', 'specs', 'tests', 'results', 'children']
  const children = childKeys.flatMap(key => array(item[key]))
  if (title && state !== undefined && children.length === 0) out.push({ name:title, status:status(state), ...(file ? { path:file } : {}), ...(inherited ? { suite:inherited } : {}), ...(durationMs === undefined ? {} : { durationSeconds:durationMs/1000 }), ...(directError ? { error:directError } : {}), ...(attempts ? { attempts } : {}), ...(attachments.length ? { attachments } : {}) })
  const nextSuite = title && state === undefined ? title : inherited
  for (const child of children) visit(child, framework, out, nextSuite, file)
}

function parseApi(value: unknown): ParsedCase[] {
  return array(record(value)?.['results'] ?? value).flatMap(raw => {
    const item=record(raw); if(!item)return []
    const method=text(item['method']) ?? 'GET', url=text(item['url']); const actualStatus=number(item['status']) ?? number(item['actualStatus']); if(!url||actualStatus===undefined)return []
    const expectedStatus=number(item['expectedStatus']), durationMs=number(item['durationMs'])
    const api: ApiObservation={method,url,actualStatus,...(expectedStatus===undefined?{}:{expectedStatus}),...(durationMs===undefined?{}:{durationMs})}
    const error=text(item['error'])
    return [{name:text(item['name']) ?? method+' '+url,path:url,suite:'API',status:error===undefined&&(expectedStatus===undefined||expectedStatus===actualStatus)?'passed':'failed',durationSeconds:(durationMs??0)/1000,api,...(error?{error}:{})}]
  })
}
function parsePerformance(value: unknown): ParsedCase[] {
  return array(record(value)?.['results'] ?? value).flatMap(raw => {
    const item=record(raw); if(!item)return []
    const metric=text(item['metric']) ?? text(item['name']), measured=number(item['value']); if(!metric||measured===undefined)return []
    const unit=text(item['unit']) ?? 'ms', threshold=number(item['threshold']), direction=item['direction']==='min'?'min' as const:'max' as const
    const passed=threshold===undefined||(direction==='max'?measured<=threshold:measured>=threshold)
    const performance: PerformanceObservation={metric,value:measured,unit,direction,...(threshold===undefined?{}:{threshold}),...(number(item['p50'])===undefined?{}:{p50:number(item['p50'])!}),...(number(item['p95'])===undefined?{}:{p95:number(item['p95'])!}),...(number(item['p99'])===undefined?{}:{p99:number(item['p99'])!}),...(number(item['throughput'])===undefined?{}:{throughput:number(item['throughput'])!})}
    return [{name:text(item['name']) ?? metric,path:metric,suite:'Performance',status:passed?'passed':'failed',durationSeconds:0,performance,...(passed?{}:{error:metric+' '+measured+unit+' breached '+direction+' '+threshold+unit})}]
  })
}

/**
 * Infer a Pytest source file from a JUnit `classname` attribute. Pytest reports
 * a dotted module path for function-style tests (`tests.test_foo`) and appends
 * a trailing PascalCase segment for unittest-style class tests
 * (`tests.test_foo.TestBar`); the class segment is not part of the file path.
 * A classname with no dot is a declared suite label rather than a module path,
 * and is intentionally not converted to a file.
 * @param classname - the JUnit `classname` attribute value.
 * @returns the inferred `.py` path, or undefined when inference would be unreliable.
 */
function inferPytestPath(classname: string): string | undefined {
  const segments = classname.split('.')
  if (segments.length < 2) return undefined
  const last = segments.at(-1)!
  const modulePathSegments = /^[A-Z]/.test(last) ? segments.slice(0, -1) : segments
  if (modulePathSegments.length === 0) return undefined
  return modulePathSegments.join('/') + '.py'
}

/** Everything one artifact contributed to the report. */
export interface StructuredResultRead {
  /** Test-level rows the artifact produced. */
  readonly tests: readonly ReportTest[]
  /**
   * Snapshot counts the artifact declared, when it declared any. A snapshot
   * mismatch is otherwise indistinguishable from an ordinary failing test.
   */
  readonly snapshots?: SnapshotCounts
}

/**
 * Read and parse one declared structured result artifact.
 * @param spec - the declared format and path.
 * @param testCase - the declaring case, supplying suite and owner defaults.
 * @param cwd - the directory the path is resolved against.
 * @returns the rows and any snapshot counts the artifact declared.
 */
export async function readStructuredResult(spec: StructuredResultSpec, testCase: SuiteCase, cwd: string): Promise<StructuredResultRead> {
  const source = await readFile(resolve(cwd, spec.path), 'utf8')
  const parsed: ParsedCase[] = spec.format === 'junit' || spec.format === 'pytest'
    ? parseJUnitDocument(source).map(entry => ({
        name: entry.name,
        ...(entry.file === undefined ? {} : { path: entry.file }),
        ...(entry.classname === undefined ? {} : { suite: entry.classname }),
        status: entry.status,
        ...(entry.durationSeconds === undefined ? {} : { durationSeconds: entry.durationSeconds }),
        ...(entry.error === undefined ? {} : { error: entry.error }),
        ...(entry.attempts === undefined ? {} : { attempts: entry.attempts }),
      }))
    : (() => {
        const value: unknown = JSON.parse(source)
        if (spec.format === 'api') return parseApi(value)
        if (spec.format === 'performance') return parsePerformance(value)
        if (spec.format === 'sarif') return parseSarif(value, cwd).map(finding => ({
          // A warning and an error both fail: a report that let them pass would
          // hide the findings the scan exists to surface. Notes are informational.
          name: finding.rule + (finding.file === undefined ? '' : ' · ' + finding.file + (finding.line === undefined ? '' : ':' + String(finding.line))),
          path: finding.file ?? finding.rule,
          suite: 'Static analysis',
          status: (finding.level === 'error' || finding.level === 'warning' ? 'failed' : 'passed') as TestStatus,
          ...(finding.level === 'error' || finding.level === 'warning' ? { error: finding.message } : {}),
        }))
        const out: ParsedCase[] = []
        if (spec.format === 'playwright') parsePlaywright(value, out)
        else visit(value, spec.format, out)
        return out
      })()
  if (parsed.length === 0) throw new Error(`structured result ${spec.path} contains no recognizable test results`)
  const tests = parsed.map(item => ({ name:item.name,path:item.path ?? (spec.format === 'pytest' && item.suite ? inferPytestPath(item.suite) ?? spec.path : spec.path),status:item.status,suite:item.suite||testCase.suite||spec.format,durationSeconds:item.durationSeconds??0,owner:testCase.owner??'Unassigned',framework:spec.format,...(item.error?{error:item.error}:{}),...(item.attempts?{attempts:item.attempts}:{}),...(item.attachments?.length?{attachments:item.attachments}:{}),...(item.api?{api:item.api}:{}),...(item.performance?{performance:item.performance}:{}) }))
  const snapshots = spec.format === 'jest' || spec.format === 'vitest' ? readSnapshotCounts(JSON.parse(source)) : undefined
  return { tests, ...(snapshots === undefined ? {} : { snapshots }) }
}

/**
 * Read one artifact and return only its rows.
 * @param spec - the declared format and path.
 * @param testCase - the declaring case.
 * @param cwd - the directory the path is resolved against.
 * @returns the test-level rows.
 */
export async function parseStructuredResult(spec: StructuredResultSpec, testCase: SuiteCase, cwd: string): Promise<ReportTest[]> {
  const read = await readStructuredResult(spec, testCase, cwd)
  return [...read.tests]
}