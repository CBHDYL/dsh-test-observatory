import { t as __exportAll } from "./rolldown-runtime-8H4AJuhK.js";
//#region lib/types/report/assets.generated.js
/**
* GENERATED - do not edit by hand. Extracted from the approved Test Observatory
* prototype so the shipped renderer and the reviewed design cannot drift.
* @module @deepseek-ai/dsh-report-observatory/assets
*/
const REPORT_STYLE = `
:root{--bg:#f5f7fb;--surface:rgba(255,255,255,.82);--solid:#fff;--text:#101828;--muted:#667085;--line:#e6eaf0;--indigo:#635bff;--blue:#0a84ff;--green:#12a36d;--red:#e5484d;--amber:#d97706;--shadow:0 20px 60px rgba(31,43,77,.09);--soft:0 8px 26px rgba(31,43,77,.07)}
[data-theme=dark]{--bg:#0b0d12;--surface:rgba(22,25,33,.85);--solid:#151821;--text:#f5f7fb;--muted:#98a2b3;--line:#292d39;--green:#3ddc97;--amber:#f5b453;--red:#ff6b70;--shadow:0 20px 60px rgba(0,0,0,.38);--soft:0 8px 26px rgba(0,0,0,.25)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;font-size:14px;line-height:1.5;transition:.25s;background-image:radial-gradient(circle at 8% -5%,rgba(99,91,255,.12),transparent 25%),radial-gradient(circle at 95% 5%,rgba(10,132,255,.1),transparent 24%)}button,input,select{font:inherit}.shell{max-width:1440px;margin:auto;padding:0 32px 80px}.topbar{height:74px;display:flex;align-items:center;gap:22px;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(20px)}.brand{display:flex;align-items:center;gap:11px;font-size:16px;font-weight:720;letter-spacing:-.02em;white-space:nowrap}.logo{width:30px;height:30px;border-radius:9px;background:linear-gradient(145deg,#7c74ff,#225cff);box-shadow:inset 0 1px 1px #ffffff80,0 6px 14px #635bff44;display:grid;place-items:center}.meta{display:flex;gap:18px;flex:1;min-width:0}.meta-item{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}.meta-item b{display:block;color:var(--text);font-size:13px;text-transform:none;letter-spacing:0;font-weight:590}.actions{display:flex;gap:8px}.btn{height:36px;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:10px;padding:0 13px;display:inline-flex;align-items:center;gap:7px;cursor:pointer;transition:.18s;white-space:nowrap}.btn:hover{transform:translateY(-1px);box-shadow:var(--soft);border-color:#a9b0bd}.btn.primary{background:linear-gradient(135deg,#6d65ff,#4058e8);border:0;color:white;box-shadow:0 8px 20px #635bff3d}.icon{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8}.hero{margin:34px 0 20px;min-height:342px;border:1px solid var(--line);border-radius:28px;padding:38px 42px;background:linear-gradient(115deg,var(--surface),color-mix(in srgb,var(--surface) 90%,#... (line truncated to 2000 chars)
@media(max-width:1050px){.meta{display:none}.hero{grid-template-columns:1fr}.score{position:absolute;right:30px;top:44px;opacity:.22}.kpis{grid-template-columns:repeat(3,1fr)}.triple{grid-template-columns:1fr 1fr}.triple>:last-child{grid-column:1/-1}}@media(max-width:720px){.shell{padding:0 16px 50px}.topbar{height:64px}.actions .btn span{display:none}.hero{padding:28px 23px}.hero h1{font-size:34px}.score{display:none}.kpis{grid-template-columns:1fr 1fr}.grid,.regress,.triple{grid-template-columns:1fr}.triple>:last-child{grid-column:auto}.toolbar{display:grid}.search,.select-wrap{width:100%}.chips{overflow:auto}.hero-copy{font-size:15px}}@media print{.topbar,.toolbar,.drawer,.drawer-backdrop,.toast,.btn{display:none!important}.shell{max-width:none;padding:0}.card,.hero{box-shadow:none;break-inside:avoid}.details-section{page-break-before:always}body{background:white;color:#111}}

/* Experience testing */
.xp{margin:26px 0}.xp-intro{padding:30px;background:linear-gradient(135deg,var(--solid),color-mix(in srgb,var(--solid) 88%,#635bff 12%))}.xp-title{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.xp-title h2{font-size:30px;margin:5px 0;letter-spacing:-.04em}.rule-pill{display:inline-flex;padding:6px 10px;border-radius:999px;background:#635bff16;color:var(--indigo);font-size:11px;font-weight:750}.xp-score{display:flex;align-items:center;gap:16px}.xp-score strong{font-size:55px;letter-spacing:-.06em}.xp-score span{color:var(--muted)}.score-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;margin-top:22px}.score-row{padding:14px;border:1px solid var(--line);border-radius:13px;background:var(--surface)}.score-top{display:flex;justify-content:space-between;font-size:12px}.score-track{height:7px;background:var(--line);border-radius:8px;margin-top:9px;overflow:hidden}.score-fill{height:100%;background:linear-gradient(90deg,#635bff,#18a8ff);border-radius:8px}.personas{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}.persona{padding:17px;cursor:pointer;transition:.2s}.persona:hover,.persona.active{border-color:#635bff80;transform:translateY(-2px)}.persona-head{display:flex;align-items:center;gap:11px}.persona-icon{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:#635bff12;color:var(--indigo)}.persona h3{font-size:14px;margin:0}.persona p{font-size:11px;color:var(--muted);margin:2px 0}.persona-stat{display:flex;justify-content:space-between;margin-top:13px;font-size:12px}.journey{padding:24px}.journey-tabs,.evidence-filters{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0}.jpill,.efilter{border:1px solid var(--line);border-radius:999px;background:var(--solid);color:var(--muted);padding:7px 11px;cursor:pointer}.jpill.active,.efilter.active{background:#635bff;color:white;border-color:#635bff}.rail{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:22px}.step{pos... (line truncated to 2000 chars)
.evidence-empty{padding:28px;text-align:center;color:var(--muted)}.modal-shot{height:auto;min-height:220px;max-height:64vh;background:#090d14;display:grid;place-items:center;overflow:auto}.modal-shot img{display:block;max-width:100%;max-height:62vh;object-fit:contain}.modal-actions{display:flex;gap:8px;margin-top:10px}.modal-actions a{text-decoration:none}.hidden{display:none!important}`;
const REPORT_BODY = `
<header class="topbar"><div class="brand"><span class="logo"><svg class="icon" viewBox="0 0 24 24" style="color:white"><path d="M5 18V9m5 9V5m5 13v-7m4 7V3"/></svg></span>Test Observatory</div><div class="meta" id="runMeta"></div><div class="actions"><button class="btn" id="share"><svg class="icon" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg><span>Share</span></button><button class="btn" id="export"><svg class="icon" viewBox="0 0 24 24"><path d="M12 3v12m-4-4 4 4 4-4M5 19h14"/></svg><span>Export PDF</span></button><button class="btn" id="theme" aria-label="Toggle theme"><svg class="icon" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9c-4 2-9-1-9-9Z"/></svg></button></div></header>
<section class="hero"><div><div class="eyebrow" id="heroEyebrow">Executive quality report · Run #1842</div><h1 id="heroHeadline">Release confidence, without the guesswork.</h1><p class="hero-copy" id="heroSummary">The candidate is measurably healthier than the previous run. Core purchase flows are stable; five isolated regressions remain contained to non-blocking edge cases.</p><div class="verdict"><span class="pulse"></span><span id="heroVerdict">Release Ready</span> <span style="color:var(--muted);font-weight:400" id="heroConfidence">· 92% confidence</span></div><div class="risk" id="heroRiskBox"><b>AI risk summary</b> · <span id="heroRisk">Low aggregate risk.</span></div><div style="margin-top:20px"><button class="btn primary" id="reviewFailures">Review 18 failures <svg class="icon" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button></div></div><div class="score"><div class="gauge-wrap"><svg width="220" height="220" viewBox="0 0 220 220"><defs><linearGradient id="scoreGrad"><stop stop-color="#736cff"/><stop offset="1" stop-color="#1aa8ff"/></linearGradient></defs><circle class="gauge-bg" cx="110" cy="110" r="88"/><circle class="gauge" cx="110" cy="110" r="88"/></svg><div class="score-label"><strong id="heroScore">92</strong><span>QUALITY SCORE</span></div></div></div></section>
<section class="kpis" id="kpis"></section>
<section class="grid"><div class="card section-card"><div class="section-head"><div><h2>Quality trajectory</h2><p id="trendCaption">Recent runs</p></div><div class="legend" id="trendLegend"><span><i class="dot" style="background:#635bff"></i>Quality score</span><span><i class="dot" style="background:#23a7e8"></i>Duration (scaled)</span></div></div><svg class="chart" id="trendChart" viewBox="0 0 700 240" preserveAspectRatio="none"><g><line class="gridline" x1="42" y1="20" x2="680" y2="20"/><line class="gridline" x1="42" y1="75" x2="680" y2="75"/><line class="gridline" x1="42" y1="130" x2="680" y2="130"/><line class="gridline" x1="42" y1="185" x2="680" y2="185"/><text x="8" y="24">100</text><text x="15" y="79">90</text><text x="15" y="134">80</text><text x="15" y="189">70</text></g><path class="trendline" stroke="#635bff" d="M50 142 L150 120 L250 131 L350 92 L450 81 L550 70 L670 64"/><path class="trendline" stroke="#23a7e8" stroke-dasharray="6 5" d="M50 72 L150 92 L250 78 L350 105 L450 118 L550 131 L670 139"/><circle class="chart-point" data-tip="Run #1836 · Score 78" cx="50" cy="142" r="4" fill="#635bff"/><text x="32" y="218">#1836</text><circle class="chart-point" data-tip="Run #1837 · Score 82" cx="150" cy="120" r="4" fill="#635bff"/><text x="132" y="218">#1837</text><circle class="chart-point" data-tip="Run #1838 · Score 80" cx="250" cy="131" r="4" fill="#635bff"/><text x="232" y="218">#1838</text><circle class="chart-point" data-tip="Run #1839 · Score 87" cx="350" cy="92" r="4" fill="#635bff"/><text x="332" y="218">#1839</text><circle class="chart-point" data-tip="Run #1840 · Score 89" cx="450" cy="81" r="4" fill="#635bff"/><text x="432" y="218">#1840</text><circle class="chart-point" data-tip="Run #1841 · Score 91" cx="550" cy="70" r="4" fill="#635bff"/><text x="532" y="218">#1841</text><circle class="chart-point" data-tip="Run #1842 · Score 92" cx="670" cy="64" r="4" fill="#635bff"/><text x="652" y="218">#1842</text></svg></div><div class="card section-card"><d... (line truncated to 2000 chars)
<section class="triple"><div class="card section-card"><div class="section-head"><div><h2>Failure causes</h2><p>Root-cause clustering</p></div></div><div class="bars" id="causes"><div class="bar-row"><span>Timeout</span><div class="track"><div class="fill" style="width:100%"></div></div><b>7</b></div><div class="bar-row"><span>Assertion</span><div class="track"><div class="fill" style="width:71%"></div></div><b>5</b></div><div class="bar-row"><span>Visual diff</span><div class="track"><div class="fill" style="width:43%"></div></div><b>3</b></div><div class="bar-row"><span>Network</span><div class="track"><div class="fill" style="width:29%"></div></div><b>2</b></div><div class="bar-row"><span>Permissions</span><div class="track"><div class="fill" style="width:14%"></div></div><b>1</b></div></div></div><div class="card section-card"><div class="section-head"><div><h2>Slowest tests</h2><p>Optimization opportunities</p></div></div><div class="rank" id="slowest"><div class="rank-row"><span class="num">01</span><div>payment authorization<small>Checkout E2E</small></div><span class="time">18.4s</span></div><div class="rank-row"><span class="num">02</span><div>catalog bulk import<small>Integration</small></div><span class="time">14.8s</span></div><div class="rank-row"><span class="num">03</span><div>order history hydrate<small>API</small></div><span class="time">11.2s</span></div><div class="rank-row"><span class="num">04</span><div>invoice rendering<small>Visual</small></div><span class="time">9.6s</span></div></div></div><div class="card section-card"><div class="section-head"><div><h2>Runtime timeline</h2><p id="timelineSubtitle">Suite execution</p></div></div><div class="gantt" id="gantt"><div class="g-row"><span>Unit</span><div class="g-track"><i class="g-seg" style="left:1%;width:28%"></i></div></div><div class="g-row"><span>API</span><div class="g-track"><i class="g-seg" style="left:8%;width:46%"></i></div></div><div class="g-row"><span>Checkout</span><div class="g-t... (line truncated to 2000 chars)
<section class="regress"><div class="card reg-card"><div class="reg-title"><div><h2 style="margin:0">New regressions</h2><span style="color:var(--muted);font-size:12px">Introduced since the previous run</span></div><span class="count">5 new</span></div><div class="issue"><div><b>Guest checkout retries after timeout</b><small>Checkout · owner Payments</small></div><span class="badge failed">Critical</span></div><div class="issue"><div><b>Viewer can open billing settings</b><small>Permissions · owner Identity</small></div><span class="badge failed">High</span></div><div class="issue"><div><b>Safari order summary alignment</b><small>Visual · owner Storefront</small></div><span class="badge flaky">Medium</span></div></div><div class="card reg-card recovered"><div class="reg-title"><div><h2 style="margin:0">Recovered tests</h2><span style="color:var(--muted);font-size:12px">Now passing consistently</span></div><span class="count">12 recovered</span></div><div class="issue"><div><b>Apply promotional code</b><small>Passed 7 consecutive runs</small></div><span class="badge passed">Recovered</span></div><div class="issue"><div><b>Session renewal on mobile</b><small>Passed 7 consecutive runs</small></div><span class="badge passed">Recovered</span></div><div class="issue"><div><b>Refund notification delivery</b><small>Passed 4 consecutive runs</small></div><span class="badge passed">Recovered</span></div></div></section>
<!--XP_START--><section class="xp" id="experience"><div class="card xp-intro"><div class="xp-title"><div><span class="rule-pill">RULE-BASED EXPERIENCE SCORE</span><h2>Experience testing</h2><p class="hero-copy" id="xpIntro">Observed journeys scored by rule.</p><div class="xp-summary"><div class="xp-kpi"><b>18</b><span>tasks observed</span></div><div class="xp-kpi"><b>15</b><span>completed</span></div><div class="xp-kpi"><b style="color:var(--red)">3</b><span>high blockers</span></div><div class="xp-kpi"><b class="boost">+7.5</b><span>recoverable points</span></div></div></div><div class="xp-score"><strong>88</strong><span>of 100<br>Good · needs polish</span></div></div><div class="score-grid" id="scoreGrid"><div class="score-row"><div class="score-top"><b>Functional completion</b><span>27 / 30</span></div><div class="score-track"><div class="score-fill" style="width:90%"></div></div></div><div class="score-row"><div class="score-top"><b>Usability</b><span>17 / 20</span></div><div class="score-track"><div class="score-fill" style="width:85%"></div></div></div><div class="score-row"><div class="score-top"><b>Visual quality</b><span>14 / 15</span></div><div class="score-track"><div class="score-fill" style="width:93%"></div></div></div><div class="score-row"><div class="score-top"><b>Feedback & recovery</b><span>12 / 15</span></div><div class="score-track"><div class="score-fill" style="width:80%"></div></div></div><div class="score-row"><div class="score-top"><b>Accessibility</b><span>9 / 10</span></div><div class="score-track"><div class="score-fill" style="width:90%"></div></div></div><div class="score-row"><div class="score-top"><b>Perceived performance</b><span>9 / 10</span></div><div class="score-track"><div class="score-fill" style="width:90%"></div></div></div></div></div>
<div class="personas" id="personas"><article class="card persona active" data-persona="new"><div class="persona-head"><span class="persona-icon">N</span><div><h3>First-time visitor</h3><p>Desktop · Chrome</p></div></div><div class="persona-stat"><span>3 tasks · 67%</span><b>Checkout discovery</b></div></article><article class="card persona" data-persona="expert"><div class="persona-head"><span class="persona-icon">P</span><div><h3>Power user</h3><p>Desktop · Keyboard</p></div></div><div class="persona-stat"><span>3 tasks · 100%</span><b>Efficient</b></div></article><article class="card persona" data-persona="error"><div class="persona-head"><span class="persona-icon">E</span><div><h3>Error-prone user</h3><p>Desktop · Invalid inputs</p></div></div><div class="persona-stat"><span>3 tasks · 67%</span><b>Recovery gap</b></div></article><article class="card persona" data-persona="mobile"><div class="persona-head"><span class="persona-icon">M</span><div><h3>Mobile shopper</h3><p>390 × 844 · Safari</p></div></div><div class="persona-stat"><span>3 tasks · 100%</span><b>Touch targets</b></div></article><article class="card persona" data-persona="a11y"><div class="persona-head"><span class="persona-icon">A</span><div><h3>Keyboard & accessibility</h3><p>No pointer · screen reader</p></div></div><div class="persona-stat"><span>3 tasks · 67%</span><b>Focus order</b></div></article><article class="card persona" data-persona="impatient"><div class="persona-head"><span class="persona-icon">F</span><div><h3>Impatient user</h3><p>Rapid input · slow network</p></div></div><div class="persona-stat"><span>3 tasks · 100%</span><b>Duplicate submit</b></div></article></div>
<div class="card journey"><div class="section-head"><div><h2>Persona journeys</h2><p>Observed human-like tasks · select a persona, then inspect any step</p></div><span class="label" id="journeyName">First-time checkout</span></div><div class="journey-tabs"><button class="jpill active" data-journey="new">First-time visitor</button><button class="jpill" data-journey="error">Error-prone</button><button class="jpill" data-journey="a11y">Keyboard</button></div><div class="rail" id="journeyRail"></div></div>
</section><!--XP_END--><div class="grid"><div class="card section-card"><div class="section-head"><div><h2>Visual evidence</h2><p>Key moments, failures and final states</p></div><span class="label">6 captures</span></div><div class="evidence-filters"><button class="efilter active" data-ev="all">All</button><button class="efilter" data-ev="fail">Failures</button><button class="efilter" data-ev="mobile">Mobile</button><button class="efilter" data-ev="final">Final state</button></div><div class="evidence-grid" id="evidenceGrid"></div></div><div class="card section-card"><div class="section-head"><div><h2>UX findings</h2><p>Observed facts separated from AI interpretation</p></div><span class="label">6 findings</span></div><div class="findings" id="findings"></div></div></div></div>
<section class="card section-card" id="checksSection"><div class="section-head"><div><h2>Visual &amp; accessibility checks</h2><p>Deterministic findings recorded by the browser</p></div></div><div id="checks"></div></section><section class="card details-section" id="tests"><div class="section-head"><div><h2>Test details</h2><p id="testsSubtitle">Explore results · click any row to inspect evidence</p></div><span id="resultCount" class="label"></span></div><div class="toolbar"><div class="search"><input id="search" placeholder="Search test name, suite, or owner…"></div><div class="chips" id="chips"><button class="chip active" data-status="all">All</button><button class="chip" data-status="failed">Failed</button><button class="chip" data-status="passed">Passed</button><button class="chip" data-status="flaky">Flaky</button><button class="chip" data-status="skipped">Skipped</button></div><div class="select-wrap"><select id="suite"><option value="all">All suites</option><option>Checkout</option><option>Identity</option><option>Storefront</option><option>API</option><option>Visual</option><option>Mobile</option></select></div><div class="select-wrap"><select id="sort"><option value="duration">Slowest first</option><option value="name">Name A–Z</option><option value="status">Status</option></select></div></div><div class="table-wrap"><table><thead><tr><th>Test</th><th>Status</th><th>Suite</th><th>Duration</th><th>Owner</th><th></th></tr></thead><tbody id="tbody"></tbody></table></div></section>
</div>`;
const REPORT_OVERLAY = `<div class="drawer-backdrop" id="backdrop"></div><aside class="drawer" id="drawer"><div class="drawer-head"><div><span class="badge failed" id="drawerStatus">Failed</span><h2 id="drawerTitle" style="font-size:23px;margin:10px 0 3px"></h2><p id="drawerMeta" style="color:var(--muted);margin:0"></p></div><button class="close" id="close" aria-label="Close">×</button></div><div class="tabs"><button class="tab active" data-tab="overview">Overview</button><button class="tab" data-tab="logs">Logs</button><button class="tab" data-tab="stack">Stack</button><button class="tab" data-tab="attachments">Attachments</button></div><div class="tabpane active" id="overview"><div class="info-grid"><div class="info"><span>Duration</span><b id="dDuration"></b></div><div class="info"><span>Suite</span><b id="dSuite"></b></div><div class="info"><span>Owner</span><b id="dOwner"></b></div><div class="info"><span>Status</span><b id="dStatus"></b></div></div><h4>Declared command</h4><div class="code" id="command"></div></div><div class="tabpane" id="logs"><h4>stdout</h4><div class="code" id="outStdout"></div><h4>stderr</h4><div class="code" id="outStderr"></div></div><div class="tabpane" id="stack"><h4>Command</h4><div class="code" id="outCommand"></div><p class="xp-note" id="outNote"></p></div><div class="tabpane" id="attachments"><div id="testAttachments" class="evidence-empty">No screenshot is linked to this command test.</div></div></aside><div class="toast" id="toast">Report link copied</div><div class="tip" id="tip"></div>
<div class="xp-modal" id="xpModal"><div class="modal-card"><div class="modal-head"><div><span class="rule-pill" id="modalTag">RUN EVIDENCE</span><h2 id="modalTitle">Evidence</h2><p class="xp-note" id="modalMeta"></p></div><button class="close" id="modalClose" aria-label="Close evidence">×</button></div><div class="modal-shot" id="modalVisual"></div><div class="modal-actions" id="modalActions"></div><div class="fact-grid" id="modalFacts"><div class="fact-block"><b>OBSERVED FACT</b><span id="modalFact"></span></div><div class="fact-block"><b>INTERPRETATION</b><span id="modalAI"></span></div><div class="fact-block"><b>NEXT ACTION</b><span id="modalRec"></span></div></div></div></div>`;
const REPORT_SCRIPT = `
const MODEL=window.__OBSERVATORY__||null;
function applyModel(m){
  if(!m)return;
  document.getElementById('heroEyebrow').textContent='Executive quality report · Run '+m.meta.runId;
  document.getElementById('heroHeadline').textContent=m.verdict.headline;
  document.getElementById('heroSummary').textContent=m.verdict.summary;
  document.getElementById('heroVerdict').textContent=m.verdict.label||'Release Ready';
  document.getElementById('heroConfidence').textContent='· '+m.verdict.confidence;
  document.getElementById('heroRisk').textContent=m.verdict.risk;
  var rb=document.getElementById('heroRiskBox');
  if(rb)rb.classList.toggle('calm',m.summary.failed===0);
  document.getElementById('heroScore').textContent=String(m.verdict.score);
  const gauge=document.querySelector('.gauge');
  if(gauge)gauge.style.strokeDashoffset=String(552*(1-m.verdict.score/100));
  document.getElementById('runMeta').innerHTML=[['Project',m.meta.project],['Branch',m.meta.branch],['Commit',m.meta.commit],['Environment',m.meta.environment],['Run time',m.meta.runAt]].filter(function(pair){return pair[1]}).map(function(pair){return '<div class="meta-item">'+pair[0]+'<b>'+pair[1]+'</b></div>'}).join('');
  document.getElementById('kpis').innerHTML=m.kpis.map(function(k){return '<div class="card kpi"><div class="label">'+k.label+'</div><div class="value">'+k.value+'</div><div class="delta'+(k.worse?' down':'')+'">'+k.delta+'</div></div>'}).join('');
  const rf=document.getElementById('reviewFailures');
  if(rf){
    if(m.summary.failed===0){rf.style.display='none'}
    else{rf.style.display='';rf.innerHTML='Review '+m.summary.failed+' failure'+(m.summary.failed===1?'':'s')+' <svg class="icon" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>'}
  }
}
applyModel(MODEL);
function applyCharts(m){
  if(!m)return;
  var svg=document.getElementById('trendChart');
  if(svg&&m.trend&&m.trend.length){
    var pts=m.trend, n=pts.length, x0=50, x1=670, top=20, bottom=185;
    var scores=pts.map(function(p){return p.score});
    var maxS=Math.max.apply(null,scores), minS=Math.min.apply(null,scores);
    if(maxS-minS<15){var mid=(maxS+minS)/2;maxS=Math.min(100,Math.ceil((mid+7.5)/5)*5);minS=Math.max(0,Math.min(maxS-15,Math.floor((mid-7.5)/5)*5));if(maxS-minS<15)minS=Math.max(0,maxS-15)}
    var xs=function(i){return n===1?x0:Math.round(x0+(x1-x0)*i/(n-1))};
    var ys=function(v){return Math.round(bottom-(bottom-top)*(v-minS)/(maxS-minS))};
    var path=pts.map(function(p,i){return (i===0?'M':'L')+xs(i)+' '+ys(p.score)}).join(' ');
    var maxD=Math.max.apply(null,pts.map(function(p){return p.durationSeconds}))||1;
    var durPath=pts.map(function(p,i){var y=Math.round(bottom-(bottom-top)*0.5*(p.durationSeconds/maxD));return (i===0?'M':'L')+xs(i)+' '+y}).join(' ');
    var grid=[0,1,2,3].map(function(k){var y=Math.round(top+(bottom-top)*k/3);return '<line class="gridline" x1="42" y1="'+y+'" x2="680" y2="'+y+'"/><text x="8" y="'+(y+4)+'">'+Math.round(maxS-(maxS-minS)*k/3)+'</text>'}).join('');
    var dots=pts.map(function(p,i){return '<circle class="chart-point" data-tip="'+p.run+' · Score '+p.score+' · '+p.durationSeconds+'s" cx="'+xs(i)+'" cy="'+ys(p.score)+'" r="4" fill="#635bff"/><text x="'+(xs(i)-18)+'" y="218">'+p.run+'</text>'}).join('');
    svg.innerHTML='<g>'+grid+'</g><path class="trendline" stroke="#635bff" d="'+path+'"/><path class="trendline" stroke="#23a7e8" stroke-dasharray="6 5" d="'+durPath+'"/>'+dots;
  }
  var cap=document.getElementById('trendCaption');
  if(cap)cap.textContent=m.trend&&m.trend.length?(m.trend.length===1?'1 run in this report':m.trend.length+' most recent runs'):'No history yet';
  var donut=document.getElementById('statusDonut');
  if(donut&&m.summary){
    var t=m.summary.total||1, seg=function(v){return (v/t)*360};
    var a=seg(m.summary.passed), b=a+seg(m.summary.failed), c=b+seg(m.summary.skipped);
    donut.style.background='conic-gradient(var(--green) 0 '+a+'deg,var(--red) '+a+'deg '+b+'deg,var(--amber) '+b+'deg '+c+'deg,#8b95a7 '+c+'deg)';
  }
  var center=document.getElementById('donutCenter');
  if(center&&m.summary)center.innerHTML='<b>'+m.summary.total+'</b><span>TOTAL TESTS</span>';
  var list=document.getElementById('statusList');
  if(list&&m.summary)list.innerHTML=[['Passed',m.summary.passed],['Failed',m.summary.failed],['Skipped',m.summary.skipped],['Flaky',m.summary.flaky]].map(function(p){return '<div><span>'+p[0]+'</span><b>'+p[1]+'</b></div>'}).join('');
}
function applyChecks(m){
  var host=document.getElementById('checks');
  if(!host)return;
  if(!m||!m.checks||!m.checks.length){host.innerHTML='<p class="xp-note">No visual or accessibility violation recorded in this run.</p>';return}
  host.innerHTML='<div class="table-wrap"><table><thead><tr><th>Severity</th><th>Family</th><th>Rule</th><th>Observation</th><th>Persona</th></tr></thead><tbody>'+m.checks.map(function(c){return '<tr><td><span class="badge '+(c.severity==='high'?'failed':'flaky')+'">'+c.severity+'</span></td><td>'+c.family+'</td><td><b>'+c.rule+'</b></td><td>'+c.detail+'</td><td>'+c.persona+'</td></tr>'}).join('')+'</tbody></table></div>';
}
function applySubtitles(m){
  if(!m)return;
  var sub=document.getElementById('testsSubtitle');
  if(sub&&m.tests){
    var suites=[];
    m.tests.forEach(function(t){if(suites.indexOf(t.suite)<0)suites.push(t.suite)});
    sub.textContent='Explore '+m.tests.length+' tests across '+suites.length+' suite'+(suites.length===1?'':'s')+' · click any row to inspect evidence';
  }
  var tl=document.getElementById('timelineSubtitle');
  if(tl&&m.summary){
    var sec=m.summary.durationSeconds||0;
    var human=sec<60?sec.toFixed(1)+'s':Math.floor(sec/60)+'m '+Math.round(sec%60)+'s';
    tl.textContent='Sequential suite execution · '+human+' wall clock';
  }
  var xp=document.getElementById('xpIntro');
  if(xp&&m.experience){
    var tasks=m.experience.tasksObserved, done=m.experience.tasksCompleted;
    var models=(m.personas||[]).length;
    xp.textContent=models+' behavior model'+(models===1?'':'s')+' completed '+done+' of '+tasks+' task'+(tasks===1?'':'s')+'. Automation verifies correctness; this score measures whether people can succeed with confidence.';
  }
}
function applyCore(m){
  if(!m)return;
  var triple=document.querySelector('.triple');if(triple)triple.classList.toggle('hidden',!m.causes.length&&!m.slowest.length&&!m.timeline.length);
  var regress=document.querySelector('.regress');if(regress)regress.classList.toggle('hidden',!m.regressions.length&&!m.recovered.length);
  var ca=document.getElementById('causes');
  if(ca&&m.causes){var mx=Math.max.apply(null,m.causes.map(function(c){return c.count}).concat([1]));ca.innerHTML=m.causes.map(function(c){return '<div class="bar-row"><span>'+c.label+'</span><div class="track"><div class="fill" style="width:'+Math.round(100*c.count/mx)+'%"></div></div><span>'+c.count+'</span></div>'}).join('')}
  var sl=document.getElementById('slowest');
  if(sl&&m.slowest)sl.innerHTML=m.slowest.map(function(t){return '<div class="rank-row"><span class="num">'+String(t.rank).padStart(2,'0')+'</span><div><b>'+t.name+'</b><small>'+t.suite+'</small></div><span class="time">'+t.durationSeconds+'s</span></div>'}).join('');
  var ga=document.getElementById('gantt');
  if(ga&&m.timeline){var tot=Math.max.apply(null,m.timeline.map(function(l){return l.startSeconds+l.durationSeconds}).concat([1]));ga.innerHTML=m.timeline.map(function(l){return '<div class="g-row"><span>'+l.label+'</span><div class="g-track"><div class="g-seg" style="left:'+Math.round(100*l.startSeconds/tot)+'%;width:'+Math.max(2,Math.round(100*l.durationSeconds/tot))+'%"></div></div></div>'}).join('')}
  var reg=document.querySelector('.reg-card:not(.recovered)');
  if(reg&&m.regressions)reg.innerHTML='<div class="reg-title"><div><h2 style="margin:0">New regressions</h2><span style="color:var(--muted);font-size:12px">Introduced since the previous run</span></div><span class="count">'+m.regressions.length+' new</span></div>'+m.regressions.map(function(r){return '<div class="issue"><div><b>'+r.name+'</b><small>'+r.scope+'</small></div><span class="badge failed">'+r.severity+'</span></div>'}).join('');
  var rec=document.querySelector('.reg-card.recovered');
  if(rec&&m.recovered)rec.innerHTML='<div class="reg-title"><div><h2 style="margin:0">Recovered tests</h2><span style="color:var(--muted);font-size:12px">Now passing consistently</span></div><span class="count">'+m.recovered.length+' recovered</span></div>'+m.recovered.map(function(r){return '<div class="issue"><div><b>'+r.name+'</b><small>'+r.evidence+'</small></div><span class="badge passed">RECOVERED</span></div>'}).join('');
}
function applyLists(m){
  if(!m||!m.experience)return;
  window.__AL=true;
  var scoreGrid=document.getElementById('scoreGrid');
  if(scoreGrid)scoreGrid.innerHTML=m.experience.dimensions.map(function(d){return '<div class="score-row"><div class="score-top"><b>'+d.label+'</b><span>'+d.earned+' / '+d.available+'</span></div><div class="score-track"><div class="score-fill" style="width:'+Math.round(100*d.earned/d.available)+'%"></div></div></div>'}).join('');
  var xk=document.querySelectorAll('.xp-kpi b');
  if(xk.length>=4){xk[0].textContent=String(m.experience.tasksObserved);xk[1].textContent=String(m.experience.tasksCompleted);xk[2].textContent=String(m.experience.blockers);xk[3].textContent='+'+m.experience.recoverablePoints;}
  var xs=document.querySelector('.xp-score strong');if(xs)xs.textContent=String(m.experience.total);
  var xb=document.querySelector('.xp-score span');if(xb)xb.innerHTML=m.experience.total+' of 100<br>'+m.experience.band;
  var pers=document.getElementById('personas');
  if(pers)pers.innerHTML=m.personas.map(function(pr,i){return '<article class="card persona'+(i===0?' active':'')+'" data-persona="'+pr.id+'"><div class="persona-head"><span class="persona-icon">'+pr.name.charAt(0)+'</span><div><h3>'+pr.name+'</h3><p>'+pr.device+'</p></div></div><div class="persona-stat"><span>'+pr.tasks+' tasks · '+pr.completionPercent+'%</span><b>'+pr.headline+'</b></div></article>'}).join('');
  var jt=document.querySelector('.journey-tabs');
  if(jt)jt.innerHTML=m.journeys.map(function(j,i){var pr=m.personas.filter(function(x){return x.id===j.personaId})[0];return '<button class="jpill'+(i===0?' active':'')+'" data-journey="'+j.personaId+'">'+(pr?pr.name:j.personaId)+'</button>'}).join('');
  var fi=document.getElementById('findings');
  if(fi)fi.innerHTML=m.findings.map(function(f){return '<article class="card finding" data-finding="'+f.id+'"><div class="finding-top"><span class="severity"'+(f.severity==='MEDIUM'?' style="color:var(--amber)"':'')+'>'+f.severity+'</span><span class="label">'+f.dimension+' · −'+f.deductedPoints+'</span></div><h3>'+f.title+'</h3><p>'+f.observation+'</p><div class="finding-foot"><span>'+f.scope+'</span><span class="boost">Potential +'+f.recoverablePoints+'</span></div></article>'}).join('');
}
const journeys=(MODEL&&MODEL.journeys)?Object.fromEntries(MODEL.journeys.map(function(j){return [j.personaId,{name:j.name,steps:j.steps.map(function(x){return {label:x.label,state:x.state,time:x.seconds===null?String.fromCharCode(8212):x.seconds+'s',evidenceIds:x.evidenceIds||[]}})}]})):{new:{name:'',steps:[]}};
const evidence=(MODEL&&MODEL.evidence?MODEL.evidence:[]).map(function(e,i){return {id:e.id||'evidence-'+(i+1),title:e.title,persona:e.personaId,journey:e.journey||'',stepLabel:e.stepLabel||'',type:e.kind,meta:e.meta,image:e.imageDataUri||''}});
function evidenceById(id){return evidence.find(function(e){return e.id===id})}
function showXp(data){var visual=document.getElementById('modalVisual'),actions=document.getElementById('modalActions'),facts=document.getElementById('modalFacts');document.getElementById('modalTitle').textContent=data.title;document.getElementById('modalMeta').textContent=data.meta||'';document.getElementById('modalTag').textContent=data.tag||'RUN EVIDENCE';visual.innerHTML=data.image?'<img src="'+data.image+'" alt="'+data.title.replaceAll('"','&quot;')+'">':'<div class="evidence-empty">No screenshot was captured for this item.</div>';actions.innerHTML=data.image?'<a class="btn primary" href="'+data.image+'" download="'+(data.filename||'test-evidence.png')+'">Download image</a><a class="btn" href="'+data.image+'" target="_blank" rel="noopener">Open full size</a>':'';document.getElementById('modalFact').textContent=data.fact||'';document.getElementById('modalAI').textContent=data.interpretation||'';document.getElementById('modalRec').textContent=data.nextAction||'';facts.classList.toggle('hidden',!data.fact&&!data.interpretation&&!data.nextAction);document.getElementById('xpModal').classList.add('open')}
function showEvidence(e,fact,interpretation,nextAction){showXp({title:e.title,meta:[e.journey,e.stepLabel,e.meta].filter(Boolean).join(' · '),image:e.image,filename:e.id+'.png',fact:fact||'Screenshot captured by Chromium during this journey step.',interpretation:interpretation||'',nextAction:nextAction||''})}
function closeXp(){document.getElementById('xpModal').classList.remove('open')}
function renderJourney(key){const keys=Object.keys(journeys);if(!key||!journeys[key])key=keys[0];const j=journeys[key];if(!j)return;document.getElementById('journeyName').textContent=j.name;document.getElementById('journeyRail').innerHTML=j.steps.map((step,i)=>'<div class="step '+(step.state!=='PASS'?'fail':'')+'" data-step="'+i+'"><span class="step-state">'+step.state+'</span><b>'+(i+1)+'. '+step.label+'</b><small>Observed '+step.time+(step.evidenceIds.length?' · '+step.evidenceIds.length+' capture':'')+'</small></div>').join('');document.querySelectorAll('.step').forEach((el,i)=>el.onclick=()=>{const step=j.steps[i],shot=step.evidenceIds.map(evidenceById).find(Boolean);if(shot)showEvidence(shot,'Chromium recorded '+step.state+' for this step after '+step.time+'.','','');else showXp({title:step.label,meta:j.name+' · '+step.time,tag:'STEP RESULT',fact:'Chromium recorded '+step.state+' for this step after '+step.time+'.'})})}
function renderEvidence(filter='all'){const host=document.getElementById('evidenceGrid'),rows=evidence.filter(e=>filter==='all'||e.type===filter);host.innerHTML=rows.length?rows.map(e=>'<article class="card evidence" data-evid="'+e.id+'"><div class="shot '+(e.type==='mobile'?'mobile':'')+'">'+(e.image?'<img class="shot-img" src="'+e.image+'" alt="'+e.title.replaceAll('"','&quot;')+'">':'<div class="evidence-empty">Capture unavailable</div>')+'</div><div class="ev-meta"><b>'+e.title+'</b><small>'+[e.journey,e.stepLabel,e.meta].filter(Boolean).join(' · ')+'</small></div></article>').join(''):'<div class="evidence-empty">No captures match this filter.</div>';host.querySelectorAll('.evidence').forEach(el=>el.onclick=()=>{const e=evidenceById(el.dataset.evid);if(e)showEvidence(e)})}
const tests=(MODEL&&MODEL.tests?MODEL.tests:[]).map(function(t){return {name:t.name,path:t.path,status:t.status,suite:t.suite,duration:t.durationSeconds,owner:t.owner,stdout:t.stdout||'',stderr:t.stderr||''}});
let statusFilter='all';const tbody=document.getElementById('tbody');
function render(){const q=document.getElementById('search').value.toLowerCase(),suite=document.getElementById('suite').value,sort=document.getElementById('sort').value;let rows=tests.filter(t=>(statusFilter==='all'||t.status===statusFilter)&&(suite==='all'||t.suite===suite)&&[t.name,t.suite,t.owner].some(v=>v.toLowerCase().includes(q)));rows.sort((a,b)=>sort==='duration'?b.duration-a.duration:sort==='name'?a.name.localeCompare(b.name):a.status.localeCompare(b.status));tbody.innerHTML=rows.length?rows.map((t)=>'<tr data-name="'+t.name.replaceAll('"','&quot;')+'"><td><span class="test-name">'+t.name+'<small>'+t.path+'</small></span></td><td><span class="badge '+t.status+'">'+t.status+'</span></td><td>'+t.suite+'</td><td>'+t.duration.toFixed(1)+'s</td><td>'+t.owner+'</td><td class="view">View →</td></tr>').join(''):'<tr><td colspan="6" class="empty">No tests match these filters.</td></tr>';document.getElementById('resultCount').textContent=rows.length+' results';tbody.querySelectorAll('tr[data-name]').forEach(r=>r.onclick=()=>openDrawer(tests.find(t=>t.name===r.dataset.name)))}
function fillDrawer(t){
  var so=document.getElementById('outStdout');
  var se=document.getElementById('outStderr');
  var oc=document.getElementById('outCommand');
  var on=document.getElementById('outNote');
  if(so)so.textContent=t.stdout||'(no output captured)';
  if(se)se.textContent=t.stderr||'(no error output captured)';
  if(oc)oc.textContent=t.path||'(no command recorded)';
  if(on)on.textContent='This report records the declared command and its captured output. It has no stack trace of its own: the command output above is the evidence.';
}
function openDrawer(t){document.getElementById('drawerTitle').textContent=t.name;document.getElementById('drawerMeta').textContent=t.suite+' · owned by '+t.owner;document.getElementById('dDuration').textContent=t.duration.toFixed(1)+'s';
  document.getElementById('dSuite').textContent=t.suite;
  document.getElementById('dOwner').textContent=t.owner;
  document.getElementById('dStatus').textContent=t.status;document.getElementById('command').textContent=t.path||'—';const badge=document.getElementById('drawerStatus');badge.textContent=t.status;badge.className='badge '+t.status;fillDrawer(t);document.getElementById('drawer').classList.add('open');document.getElementById('backdrop').classList.add('open')}
function closeDrawer(){document.getElementById('drawer').classList.remove('open');document.getElementById('backdrop').classList.remove('open')}document.getElementById('close').onclick=closeDrawer;document.getElementById('backdrop').onclick=closeDrawer;document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});document.getElementById('search').oninput=render;document.getElementById('suite').onchange=render;document.getElementById('sort').onchange=render;document.getElementById('chips').onclick=e=>{if(!e.target.dataset.status)return;statusFilter=e.target.dataset.status;document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c===e.target));render()};document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab,.tabpane').forEach(x=>x.classList.remove('active'));t.classList.add('active');document.getElementById(t.dataset.tab).classList.add('active')});document.getElementById('theme').onclick=()=>{const root=document.documentElement;root.dataset.theme=root.dataset.theme==='dark'?'light':'dark'};document.getElementById('export').onclick=()=>window.print();document.getElementById('share').onclick=async()=>{try{await navigator.clipboard.writeText(location.href)}catch(e){}const toast=document.getElementById('toast');toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1800)};document.getElementById('reviewFailures').onclick=()=>{statusFilter='failed';document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.status==='failed'));render();document.getElementById('tests').scrollIntoView({behavior:'smooth'})};const tip=document.getElementById('tip');document.querySelectorAll('.chart-point').forEach(p=>{p.onmouseenter=e=>{tip.textContent=p.dataset.tip;tip.style.opacity=1};p.onmousemove=e=>{tip.style.left=e.clientX+12+'px';tip.style.top=e.clientY-35+'px'};p.onmouseleave=()=>tip.style.opacity=0});render();
if(MODEL){applyCore(MODEL);applyCharts(MODEL);applyChecks(MODEL);applySubtitles(MODEL);}if(MODEL&&MODEL.experience){applyLists(MODEL);renderJourney();renderEvidence();}
const jtEl=document.querySelector('.journey-tabs');if(jtEl)jtEl.onclick=e=>{const b=e.target.closest('.jpill');if(!b)return;document.querySelectorAll('.jpill').forEach(x=>x.classList.toggle('active',x===b));renderJourney(b.dataset.journey)};
const persEl=document.getElementById('personas');if(persEl)persEl.onclick=e=>{const p=e.target.closest('.persona');if(!p)return;document.querySelectorAll('.persona').forEach(x=>x.classList.toggle('active',x===p));const match=document.querySelector('.jpill[data-journey="'+p.dataset.persona+'"]');if(match)match.click()};
document.querySelectorAll('.efilter').forEach(b=>b.onclick=()=>{document.querySelectorAll('.efilter').forEach(x=>x.classList.toggle('active',x===b));renderEvidence(b.dataset.ev)});
const findEl=document.getElementById('findings');if(findEl)findEl.onclick=function(event){const card=event.target.closest('.finding');if(!card)return;const finding=(MODEL.findings||[]).find(function(f){return f.id===card.dataset.finding});if(!finding)return;const shot=(finding.evidenceIds||[]).map(evidenceById).find(Boolean);showXp({title:finding.title,meta:finding.scope,tag:'OBSERVED FINDING',image:shot&&shot.image,filename:shot&&shot.id+'.png',fact:finding.observation,interpretation:'',nextAction:'Rerun the same journey after addressing the observed failure.'})};
var modalClose=document.getElementById('modalClose');if(modalClose)modalClose.onclick=closeXp;var xpModal=document.getElementById('xpModal');if(xpModal)xpModal.onclick=e=>{if(e.target.id==='xpModal')closeXp()};document.addEventListener('keydown',e=>{if(e.key==='Escape')closeXp()});
`;
//#endregion
//#region lib/types/report/render.js
/**
* Pure HTML rendering of the Test Observatory report. The reviewed visual
* design (markup, stylesheet and client script) is carried by the generated
* asset module; this module binds a ReportModel into it. No I/O, no Cordis,
* no clock or random: the same model always renders the same document.
* @module @deepseek-ai/dsh-report-observatory/render
*/
/**
* Escape the five HTML-significant characters so interpolated user-controlled
* strings cannot inject markup.
* @param value - raw string that may contain `< > & \" '`.
* @returns the string with each significant character replaced by its entity.
*/
function escapeHtml(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}
/**
* Serialize the report model for embedding inside a script element. The JSON
* is additionally guarded against terminating the script element itself.
* @param model - the report model to embed.
* @returns a JSON literal safe to place inside `<script>`.
*/
function embedModel(model) {
	return JSON.stringify(model).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
/**
* Remove the experience section from the reviewed markup when the run produced
* no human-simulation data, so a command-only run shows no empty shells.
* @param body - the reviewed report body markup.
* @returns the markup with the experience section removed.
*/
function stripExperience(body) {
	const withoutChecks = stripSection(body, "id=\"checksSection\"");
	const start = withoutChecks.indexOf("<!--XP_START-->");
	const end = withoutChecks.indexOf("<!--XP_END-->");
	if (start === -1 || end === -1 || end < start) return withoutChecks;
	return withoutChecks.slice(0, start) + withoutChecks.slice(end + 13);
}
/**
* Remove one top-level section identified by an id attribute, together with
* its wrapper, when a run produced no data for it.
* @param body - the reviewed report body markup.
* @param idAttribute - the exact id attribute text to locate.
* @returns the markup with that section removed.
*/
function stripSection(body, idAttribute) {
	const start = body.indexOf(idAttribute);
	if (start === -1) return body;
	const open = body.lastIndexOf("<section", start);
	const close = body.indexOf("</section>", start);
	if (open === -1 || close === -1) return body;
	return body.slice(0, open) + body.slice(close + 10);
}
/**
* Render one self-contained report document.
* @param model - every fact the report shows.
* @returns a complete HTML5 document with no external resources.
*/
function renderReport(model) {
	return [
		"<!DOCTYPE html>",
		"<html lang=\"en\" data-theme=\"light\"><head><meta charset=\"utf-8\">",
		"<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
		"<title>" + escapeHtml(model.meta.project + " — Test Observatory") + "</title>",
		"<style>" + REPORT_STYLE + "</style></head><body><div class=\"shell\">",
		model.experience === void 0 ? stripExperience(REPORT_BODY) : REPORT_BODY,
		"<script>window.__OBSERVATORY__=" + embedModel(model) + ";<\/script>",
		REPORT_OVERLAY,
		"<script>" + REPORT_SCRIPT + "<\/script>",
		"</body></html>"
	].join("");
}
//#endregion
//#region lib/types/report/index.js
var report_exports = /* @__PURE__ */ __exportAll({
	escapeHtml: () => escapeHtml,
	renderReport: () => renderReport
});
//#endregion
export { escapeHtml as n, renderReport as r, report_exports as t };
