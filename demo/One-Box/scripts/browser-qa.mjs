import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const require = createRequire(import.meta.url);
const { startStaticServer } = require('../lib/static-server.cjs');
const { createOneboxApp } = require('../../../apps/orchestrator/dist/apps/orchestrator/onebox-server.js');
const out = path.resolve('reports/onebox');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const servers = [];
const errors = [];
const checks = [];
const config = { uiHost: '127.0.0.1', uiPort: 0, demoMode: true };
const ui = await startStaticServer('apps/onebox-static/dist', config);
servers.push(ui);
const origin = `http://127.0.0.1:${ui.address().port}`;
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
const requests = [];
page.on('request', r => { if (['fetch','xhr','eventsource'].includes(r.resourceType())) requests.push(r.url()); });
async function act(text, result, confirm = true) {
  await page.locator('#question').fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: confirm ? 'Confirm plan' : 'Cancel', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#send').disabled);
  if (result) assert.ok((await page.locator('#feed').innerText()).includes(result), result);
}
async function accessibility(label) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  fs.writeFileSync(path.join(out, `axe-${label}.json`), JSON.stringify(result.violations,null,2));
  assert.deepEqual(result.violations.map(v => ({ id:v.id, nodes:v.nodes.map(n=>n.target) })), [], label);
  checks.push(`WCAG AA ${label}`);
}
try {
  await page.goto(origin);
  await page.locator('#execution-scope').filter({ hasText:'Offline preview' }).waitFor();
  await accessibility('preview');
  await page.screenshot({ path:path.join(out,'desktop.png'),fullPage:true });
  await act('Post a source-cited software audit for 5 AGIALPHA','',false);
  assert.ok(!(await page.locator('#status-board').innerText()).includes('Audit'));
  await act('Post a source-cited software audit for 5 AGIALPHA','Preview job 1: created');
  await act('Finalize job 1','Cannot finalize job 1 while it is created');
  for (const [text,status] of [['Apply job 1','assigned'],['Submit job 1 with a reproducible report','submitted'],['Validate job 1','validated'],['Finalize job 1','finalized']]) await act(text,`Preview job 1: ${status}`);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button',{name:'Export preview evidence'}).click();
  const download = await downloadPromise;
  await download.saveAs(path.join(out,'preview-evidence.json'));
  const evidence = JSON.parse(fs.readFileSync(path.join(out,'preview-evidence.json')));
  assert.equal(evidence.jobs[0].status,'finalized');
  assert.equal(evidence.events.length,5);
  assert.equal(evidence.productionApproved,false);
  assert.equal(evidence.chainTransactions,0);
  assert.deepEqual(requests, [], 'Offline preview must make zero API/provider requests');
  checks.push('Cancellation, ordered lifecycle, early-finalization rejection, zero-network preview and evidence export');
  await page.getByRole('button',{name:'Advanced',exact:true}).click();
  await page.locator('.owner-disclosure > summary').click();
  assert.ok((await page.locator('[data-role="advanced-log"]').innerText()).includes('finalize'), 'Latest evidence survives opening Advanced');
  await accessibility('expanded');
  for (const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`No horizontal overflow at ${width}px`);
    await accessibility(`mobile-${width}`);
    await page.screenshot({path:path.join(out,`mobile-${width}.png`),fullPage:true});
  }
  await page.reload();
  assert.ok(!(await page.locator('#status-board').innerText()).includes('finalized'));
  checks.push('Reload clears the simulation; desktop and 320/390px layouts');

  // Guided mission: inspect sources, break a citation, recover without losing history.
  async function missionAction(name, confirm = true) {
    await page.getByRole('button',{name,exact:true}).click();
    assert.equal(await page.locator('#mission-confirmation').isVisible(),true);
    assert.equal(await page.locator('#mission-report').getAttribute('readonly'),'');
    if (name === 'Review mission plan') await accessibility('mission-confirmation');
    await page.getByRole('button',{name:confirm ? 'Confirm plan' : 'Cancel',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#send').disabled);
  }
  await page.setViewportSize({width:1440,height:1080});
  await page.getByRole('button',{name:'Review mission plan',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('#send').disabled);
  assert.equal(await page.getByRole('button',{name:'Review mission plan',exact:true}).evaluate(el=>el===document.activeElement),true);
  await missionAction('Review mission plan');
  await missionAction('Review assignment');
  await page.locator('#mission-evidence > summary').click();
  await page.getByRole('button',{name:'Remove a citation',exact:true}).click();
  await missionAction('Review submission',false);
  assert.ok((await page.locator('.mission-meta').innerText()).includes('assigned'));
  assert.equal(JSON.parse(await page.locator('#mission-report').inputValue()).findings[0].source,'');
  await missionAction('Review submission');
  assert.equal(await page.locator('#mission-report').getAttribute('readonly'),'');
  await missionAction('Review validation');
  assert.ok((await page.locator('.mission-review').innerText()).includes('Report needs correction'));
  await accessibility('mission-rejected');
  await page.screenshot({path:path.join(out,'mission-rejected.png'),fullPage:true});
  await page.getByRole('button',{name:'Restore sample',exact:true}).click();
  assert.equal(JSON.parse(await page.locator('#mission-report').inputValue()).findings[0].source,'fixture/tests');
  await missionAction('Review resubmission');
  await missionAction('Review validation');
  assert.ok((await page.locator('.mission-review').innerText()).includes('11/11 checks passed'));
  await missionAction('Review finalization');
  const briefPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download submitted brief',exact:true}).click();
  const brief=await briefPromise; await brief.saveAs(path.join(out,'mission-brief.md'));
  const briefText=fs.readFileSync(path.join(out,'mission-brief.md'),'utf8');
  assert.ok(briefText.includes('SIMULATED TEACHING ARTIFACT'));
  assert.ok(briefText.includes('"recommendation": "hold"'));
  const missionExportPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export preview evidence'}).click();
  const missionExport=await missionExportPromise; await missionExport.saveAs(path.join(out,'mission-evidence.json'));
  const missionEvidence=JSON.parse(fs.readFileSync(path.join(out,'mission-evidence.json'),'utf8'));
  assert.equal(missionEvidence.events.filter(e=>e.action==='submit').length,2);
  assert.equal(missionEvidence.events.filter(e=>e.action==='validate')[0].review.approved,false);
  assert.equal(missionEvidence.jobs[0].status,'finalized');
  assert.deepEqual(requests,[]);
  await accessibility('mission-complete');
  for (const width of [1440,390,320]) {
    await page.setViewportSize({width,height:width===1440?1080:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await accessibility(`mission-${width}`);
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(out,`mission-${width}.png`),fullPage:true});
  }
  await missionAction('Review another mission');
  await page.locator('#mission-selection').selectOption('1');
  assert.ok((await page.locator('.mission-meta').innerText()).includes('finalized'));
  assert.equal(JSON.parse(await page.locator('#mission-report').inputValue()).recommendation,'hold');
  await page.locator('#mission-selection').selectOption('2');
  assert.ok((await page.locator('.mission-meta').innerText()).includes('created'));
  await page.getByRole('button',{name:'Advanced',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Set API token',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Set base URL',exact:true}).isDisabled(),true);
  checks.push('Guided mission: bound report, rejected evidence, cancellation, repair, eleven checks, report download and immutable submission history');
  // Storage access can throw after localStorage is obtained (privacy policies).
  const privateContext=await browser.newContext();
  await privateContext.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('denied');};Storage.prototype.setItem=()=>{throw new Error('denied');};Storage.prototype.removeItem=()=>{throw new Error('denied');};});
  const privatePage=await privateContext.newPage();
  privatePage.on('pageerror',e=>errors.push(e.message));
  await privatePage.goto(origin);
  await privatePage.getByRole('button',{name:'Review mission plan',exact:true}).click();
  await privatePage.getByRole('button',{name:'Confirm plan',exact:true}).click();
  await privatePage.waitForFunction(()=>!document.querySelector('#send').disabled);
  assert.ok((await privatePage.locator('.mission-meta').innerText()).includes('created'));
  await privateContext.close();
  checks.push('Offline credential controls disabled; preview survives denied browser storage');

  // Run the real packaged HTTP router with explicit synthetic provider/chain service results.
  // This verifies the browser/server contract; it does not attest a real deployment.
  const token = 'onebox-browser-test-token';
  process.env.ONEBOX_API_TOKEN = token;
  process.env.ONEBOX_CORS_ALLOW = origin;
  process.env.ONEBOX_PREFIX = '/onebox';
  const intent = {kind:'post_job',title:'Connected fixture',description:'Synthetic service fixture',reward_agialpha:'5',deadline_days:7,attachments:[],constraints:{}};
  const planHash = '0x' + 'ab'.repeat(32);
  const executed = [];
  const app = createOneboxApp({
    async plan(text, expert) { assert.equal(text,'Post the connected fixture'); assert.equal(expert,true); return {intent,summary:'Inspect the connected fixture',planHash,requiresConfirmation:true,warnings:[],missing_fields:[],plan:{plan_id:planHash,steps:[],budget:{token:'AGIALPHA',max:'5'},policies:{allowTools:[],denyTools:[],requireValidator:true}}}; },
    async execute(received, mode, options) { assert.deepEqual(received,intent);assert.equal(mode,'wallet');assert.equal(options.planHash,planHash);executed.push(received);return {ok:true,to:'0x'+'11'.repeat(20),data:'0x12345678',value:'0x0',chainId:31337,planHash}; },
    async status() { return {jobs:[]}; },
  });
  app.post('/legacy/plan', (_req,res) => res.json({intent:'finalize',params:{jobId:1},confirm:true,summary:'Review legacy ICS fixture'}));
  app.post('/legacy/execute', (req,res) => {
    assert.equal(req.body.ics.intent,'finalize');
    res.type('text/event-stream').send('data: ' + JSON.stringify({type:'receipt',text:'Legacy ICS fixture completed',advanced:{simulated:true}}) + '\n\n');
  });
  let interruptedRequests=0;
  app.post('/interrupted/plan',(_req,res)=>res.json({intent,planHash,summary:'Review interrupted fixture',requiresConfirmation:true}));
  app.post('/interrupted/execute',(_req,res)=>{interruptedRequests++;res.writeHead(200,{'Content-Type':'application/json','Content-Length':'200'});res.write('{"ok":',()=>res.destroy());});
  app.post('/empty/plan',(_req,res)=>res.json({intent,planHash,summary:'Review empty fixture',requiresConfirmation:true}));
  app.post('/empty/execute',(_req,res)=>res.status(200).end());
  app.post('/ack/plan',(_req,res)=>res.json({intent,planHash,summary:'Review bare acknowledgement',requiresConfirmation:true}));
  app.post('/ack/execute',(_req,res)=>res.json({ok:true}));
  const api = await new Promise(resolve => {const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  servers.push(api);
  config.demoMode=false;
  config.publicOrchestratorUrl=`http://127.0.0.1:${api.address().port}`;
  const health = await fetch(config.publicOrchestratorUrl+'/healthz');assert.equal(health.status,200);
  assert.equal((await fetch(config.publicOrchestratorUrl+'/onebox/status')).status,401);
  assert.equal((await fetch(config.publicOrchestratorUrl+'/onebox/status',{headers:{Origin:'https://untrusted.invalid',Authorization:`Bearer ${token}`}})).status,403);
  await page.setViewportSize({width:1440,height:1080});
  await page.goto(`${origin}/?orchestrator=${encodeURIComponent(config.publicOrchestratorUrl)}&mode=expert`);
  await page.getByRole('button',{name:'Advanced',exact:true}).click();
  await page.getByRole('button',{name:'Set API token',exact:true}).click();
  assert.equal(await page.locator('#api-token-input').getAttribute('type'),'password');
  await accessibility('token-dialog');
  await page.locator('#api-token-input').fill(token);
  await page.getByRole('button',{name:'Apply token',exact:true}).click();
  assert.equal(await page.evaluate(t=>Object.values(localStorage).some(v=>v.includes(t)),token),false);
  assert.ok(!page.url().includes(token));
  await act('Post the connected fixture','Wallet transaction prepared for review. No transaction has been sent.');
  assert.equal(executed.length,1);
  await accessibility('connected');
  await page.reload();
  await page.getByRole('button',{name:'Advanced',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Clear API token',exact:true}).count(),0);
  assert.equal(executed.length,1);
  checks.push('Actual packaged HTTP router: auth, CORS, intent.kind, planHash, wallet calldata, token lifetime');
  await page.goto(`${origin}/?orchestrator=${encodeURIComponent(config.publicOrchestratorUrl)}&oneboxPrefix=/legacy`);
  await act('Run legacy fixture','Legacy ICS fixture completed');
  checks.push('Preserved ICS confirmation and SSE execution path');
  await page.goto(`${origin}/?orchestrator=${encodeURIComponent(config.publicOrchestratorUrl)}&oneboxPrefix=/interrupted`);
  await act('Post interrupted fixture','Execution outcome is unknown');
  assert.equal(interruptedRequests,1,'No automatic execution retries');
  assert.ok((await page.locator('#feed').innerText()).includes('chain receipts before creating another plan'));
  await page.goto(`${origin}/?orchestrator=${encodeURIComponent(config.publicOrchestratorUrl)}&oneboxPrefix=/empty`);
  await act('Post empty fixture','Execution outcome is unknown');
  assert.ok(!(await page.locator('#feed').innerText()).includes('✅ Request completed'));
  await page.goto(`${origin}/?orchestrator=${encodeURIComponent(config.publicOrchestratorUrl)}&oneboxPrefix=/ack`);
  await act('Post acknowledgement fixture','Execution outcome is unknown');
  checks.push('Interrupted, empty and bare acknowledgement execution responses require reconciliation; no false completion or automatic retry');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'browser-qa.json'),JSON.stringify({ok:true,checks,pageErrors:errors,scope:'Offline simulation and real HTTP router with synthetic service adapters; no real provider or blockchain commissioning'},null,2));
  console.log(JSON.stringify({ok:true,checks},null,2));
} finally {
  await browser.close();
  for (const server of servers) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
