import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { projectHistory } from '../src/command/history.ts'
import type { ReportModel, TestStatus } from '../src/report/types.ts'
const root=join(process.cwd(),'.tmp-test-observatory-history'),path=join(root,'history.json')
const model=(runId:string,status:TestStatus):ReportModel=>({meta:{project:'p',branch:'',commit:'',environment:'local',runAt:runId,runId},verdict:{score:status==='failed'?0:100,headline:'',label:'',summary:'',confidence:'',risk:''},kpis:[],summary:{total:1,passed:status==='passed'?1:0,failed:status==='failed'?1:0,skipped:0,flaky:0,durationSeconds:1,coveragePercent:null},trend:[],causes:[],slowest:[],timeline:[],regressions:[],recovered:[],tests:[{name:'case',path:'a.ts',status,suite:'unit',durationSeconds:1,owner:'team'}]})
describe('projectHistory',()=>{
 it('records trend, regressions, recovery and flaky transitions',async()=>{await rm(root,{recursive:true,force:true});let p=await projectHistory(path,model('r1','passed'));expect(p.trend).toHaveLength(1);p=await projectHistory(path,model('r2','failed'));expect(p.regressions[0]?.name).toBe('case');expect(p.tests[0]?.status).toBe('failed');p=await projectHistory(path,model('r3','passed'));expect(p.recovered[0]?.name).toBe('case');expect(p.tests[0]?.status).toBe('flaky');expect(p.trend).toHaveLength(3)})
 it('leaves no temporary file after atomic persistence',async()=>{await rm(root,{recursive:true,force:true});await projectHistory(path,model('r','passed'));expect((await readdir(root)).filter(name=>name.includes('.tmp-'))).toEqual([])})
 it('bounds retained history to twenty runs',async()=>{await rm(root,{recursive:true,force:true});for(let index=0;index<23;index++)await projectHistory(path,model('r'+index,'passed'));const saved=JSON.parse(await (await import('node:fs/promises')).readFile(path,'utf8'));expect(saved.runs).toHaveLength(20);expect(saved.runs[0].runId).toBe('r3')})
 it('surfaces corrupt history instead of silently replacing it',async()=>{await mkdir(root,{recursive:true});await writeFile(path,'bad');await expect(projectHistory(path,model('r','passed'))).rejects.toThrow()})
})