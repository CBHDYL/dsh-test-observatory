/** Adapt model-facing command outcomes to the shared Test Observatory report. */
import { renderReport as renderObservatory } from '../report/render.ts'
import type { ReportModel } from '../report/types.ts'

/** One executed shell command returned by the model-facing tool. */
export interface TestCaseResult { readonly name:string; readonly command:string; readonly exitCode:number|null; readonly expectedExitCode:number; readonly passed:boolean; readonly durationMs:number; readonly stdout:string; readonly stderr:string }
/** Aggregate command counts returned by the model-facing tool. */
export interface TestRunSummary { readonly total:number; readonly passed:number; readonly failed:number; readonly durationMs:number }

/**
 * Render model-facing command results with the same standalone Observatory UI as /test.
 * @param title - report and project title.
 * @param summary - aggregate command counts.
 * @param results - command outcomes in execution order.
 * @returns one self-contained HTML document.
 */
export function renderReport(title:string,summary:TestRunSummary,results:readonly TestCaseResult[]):string {
  const durationSeconds=Math.round(summary.durationMs/10)/100
  const passRate=summary.total===0?0:Math.round(summary.passed/summary.total*1000)/10
  let elapsed=0
  const model:ReportModel={
    meta:{project:title,branch:'',commit:'',environment:'tool',runAt:new Date().toISOString().replace('T',' ').slice(0,16)+' UTC',runId:String(Date.now()).slice(-6)},
    verdict:{score:Math.round(passRate),headline:summary.failed===0?'Every test passed.':summary.failed+' tests failed.',label:summary.failed===0?'Suite passing':'Suite failing',summary:summary.failed===0?'The command suite completed without failures.':'Inspect failed command evidence before release.',confidence:passRate+'% pass rate',risk:summary.failed===0?'No failing command in this run.':'Captured output is available in test details.'},
    kpis:[{label:'Pass rate',value:passRate+'%',delta:summary.passed+' of '+summary.total,...(summary.failed?{worse:true}:{})},{label:'Total tests',value:String(summary.total),delta:summary.total+' observed'},{label:'Duration',value:durationSeconds.toFixed(1)+'s',delta:'wall clock'},{label:'Failed',value:String(summary.failed),delta:summary.failed?'needs review':'none',...(summary.failed?{worse:true}:{})}],
    summary:{total:summary.total,passed:summary.passed,failed:summary.failed,skipped:0,flaky:0,durationSeconds,coveragePercent:null},trend:[],causes:summary.failed?[{label:'Non-zero exit',count:summary.failed}]:[],
    slowest:[...results].sort((a,b)=>b.durationMs-a.durationMs).slice(0,10).map((result,index)=>({rank:index+1,name:result.name,suite:'Command',durationSeconds:result.durationMs/1000})),
    timeline:results.map(result=>{const duration=result.durationMs/1000,current={label:result.name,startSeconds:elapsed,durationSeconds:duration};elapsed+=duration;return current}),regressions:[],recovered:[],
    tests:results.map(result=>({name:result.name,path:result.command,status:result.passed?'passed':'failed',suite:'Command',durationSeconds:result.durationMs/1000,owner:'Unassigned',stdout:result.stdout,stderr:result.stderr,...(result.passed?{}:{error:'Exit '+String(result.exitCode)+'; expected '+result.expectedExitCode})}))
  }
  return renderObservatory(model)
}
