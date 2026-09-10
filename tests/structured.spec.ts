import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseStructuredResult } from '../src/command/structured.ts'

const root = join(process.cwd(), '.tmp-test-observatory-structured')
async function artifact(name: string, body: string): Promise<string> { await mkdir(root, { recursive: true }); await writeFile(join(root, name), body); return name }
const base = { name: 'framework', command: 'true', owner: 'Quality' }

describe('parseStructuredResult', () => {
  it('parses JUnit and pytest XML cases with failures and skips', async () => {
    const path = await artifact('junit.xml', '<testsuite><testcase name="passes" classname="unit" file="a.py" time="0.2"/><testcase name="fails" classname="unit" time="0.3"><failure><![CDATA[expected 2]]></failure></testcase><testcase name="skip"><skipped/></testcase></testsuite>')
    const rows = await parseStructuredResult({ format: 'pytest', path }, base, root)
    expect(rows[0]?.path).toBe('a.py')
    const nested=await artifact('nested.xml','<testsuite><testcase name="deep" classname="pkg.sub.module_test" time="0.1"/></testsuite>')
    const nestedRows=await parseStructuredResult({format:'pytest',path:nested},base,root)
    expect(nestedRows[0]?.path).toBe('pkg/sub/module_test.py')
    expect(rows.map(row => [row.name, row.status])).toEqual([['passes','passed'],['fails','failed'],['skip','skipped']])
    expect(rows[1]?.error).toBe('expected 2')
    const selfClosing=await artifact('selfclosing.xml','<testsuite><testcase name="selfclosing"><failure message="assert 1 == 2"/></testcase></testsuite>')
    const failed=await parseStructuredResult({format:'pytest',path:selfClosing},base,root)
    expect(failed[0]).toMatchObject({status:'failed',error:'assert 1 == 2'})
  })

  it('parses Jest and Vitest assertion results', async () => {
    const path = await artifact('jest.json', JSON.stringify({ testResults: [{ name: '/src/a.test.ts', assertionResults: [{ fullName: 'adds', status: 'passed', duration: 12 }, { fullName: 'subtracts', status: 'failed', duration: 8, failureMessages: ['bad math'] }] }] }))
    const rows = await parseStructuredResult({ format: 'jest', path }, base, root)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: 'adds', path: '/src/a.test.ts', status: 'passed', durationSeconds: 0.012, framework: 'jest' })
    expect(rows[1]?.error).toBe('bad math')
  })

  it('parses API observations and performance thresholds', async () => {
    const apiPath=await artifact('api.json',JSON.stringify({results:[{name:'health',method:'GET',url:'/health',expectedStatus:200,status:503,durationMs:25}]}))
    const api=await parseStructuredResult({format:'api',path:apiPath},base,root)
    expect(api[0]).toMatchObject({status:'failed',api:{method:'GET',actualStatus:503,expectedStatus:200}})
    const perfPath=await artifact('perf.json',JSON.stringify({results:[{name:'latency',metric:'http_req_duration',value:240,unit:'ms',threshold:200,direction:'max',p50:100,p95:220,p99:300,throughput:42}]}))
    const perf=await parseStructuredResult({format:'performance',path:perfPath},base,root)
    expect(perf[0]).toMatchObject({status:'failed',performance:{p95:220,throughput:42}})
  })

  it('rejects artifacts with no recognizable test rows',async()=>{const path=await artifact('empty.json','{}');await expect(parseStructuredResult({format:'jest',path},base,root)).rejects.toThrow(/no recognizable test results/)})

  it('parses Playwright attachments and retry count', async () => {
    const path = await artifact('playwright.json', JSON.stringify({ suites: [{ title: 'checkout.spec.ts', specs: [{ title: 'pays', file: '/tests/checkout.spec.ts', ok: false, tests: [{ status: 'unexpected', results: [{ retry: 0, status: 'failed', duration: 40, errors: [{ message: 'timeout' }], attachments: [{ name: 'screenshot', contentType: 'image/png', path: 'shot.png' }, { name: 'trace', contentType: 'application/zip', path: 'trace.zip' }] }, { retry: 1, status: 'passed', duration: 20 }] }] }] }] }))
    const rows = await parseStructuredResult({ format: 'playwright', path }, base, root)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'pays', status: 'flaky', attempts: 2, path: '/tests/checkout.spec.ts', durationSeconds: 0.02, attachments: [{ kind: 'screenshot', path: 'shot.png' }, { kind: 'trace', path: 'trace.zip' }] })
  })
})