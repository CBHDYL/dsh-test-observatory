import { describe,expect,it } from 'vitest'
import { renderReport } from '../src/tool/report.ts'
describe('model tool Observatory report',()=>{
 it('uses the shared premium report and real command evidence',()=>{const html=renderReport('Tool suite',{total:1,passed:0,failed:1,durationMs:250},[{name:'lint',command:'pnpm lint',exitCode:1,expectedExitCode:0,passed:false,durationMs:250,stdout:'out',stderr:'bad'}]);expect(html).toContain('Test Observatory');expect(html).toContain('window.__OBSERVATORY__=');expect(html).toContain('pnpm lint');expect(html).toContain('bad');expect(html).toContain('.drawer{position:fixed')})
 it('does not fabricate history for an empty run',()=>{const html=renderReport('Empty',{total:0,passed:0,failed:0,durationMs:0},[]);expect(html).toContain('"trend":[]');expect(html).not.toContain('Visual evidence')})
})
