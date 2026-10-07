import { spawnSync } from 'node:child_process';
import { createDraft } from '../../website/assets/work-model.mjs';

export function reviewFixture() {
  const { task } = createDraft({
    type: 'performance',
    runtime: 'openclaw',
    workerProfile: 'fixture',
    goal: 'Review this synthetic fixture, not a completed customer engagement.',
    scope:
      'Verify the synthetic files and explicitly record that no live provider was called.',
    sources: 'https://example.org/fixture',
    dataClass: 'synthetic',
    reward: '1500',
    runMinutes: '60',
    reviewerMinutes: '15',
  });
  const run = spawnSync(
    process.execPath,
    [
      '-e',
      `
    require('tsx/cjs');
    const fs=require('node:fs'), os=require('node:os'), path=require('node:path'), http=require('node:http');
    const {executeComputerWork,computerTaskDigest}=require('./apps/orchestrator/computerWork.ts');
    (async()=>{
      const task=JSON.parse(fs.readFileSync(0,'utf8'));
      const stateDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'agi-review-'));
      const artifacts=task.deliverables.map(item=>({...item,content:item.mediaType==='application/json'?JSON.stringify({synthetic:true,source:'local-fixture'}):'Synthetic evidence — α. <img src=x onerror="window.reviewInjected=true">'}));
      const server=http.createServer((req,res)=>{req.resume();res.end(JSON.stringify({id:'resp_review_fixture',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({status:'completed',summary:'Synthetic local HTTP fixture; no external provider or buyer.',artifacts})}]}]}));});
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      process.env.COMPUTER_WORK_REVIEW_TOKEN='synthetic-fixture-token';
      try {
        const receipt=await executeComputerWork('42',task,{endpoint:'http://127.0.0.1:'+server.address().port+'/v1/responses',agentId:'worker',tokenEnv:'COMPUTER_WORK_REVIEW_TOKEN',deploymentId:'review-fixture',mode:'fixture',timeoutMs:2000,maxResponseBytes:100000,maxOutputTokens:2048,approvedJobs:[{jobId:'42',taskSha256:computerTaskDigest(task)}]},{stateDirectory});
        process.stdout.write(JSON.stringify({task,receipt,receiptText:fs.readFileSync(path.join(stateDirectory,fs.readdirSync(stateDirectory)[0]),'utf8')}));
      } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(stateDirectory,{recursive:true,force:true});}
    })().catch(error=>{console.error(error.message);process.exitCode=1;});
  `,
    ],
    {
      input: JSON.stringify(task),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    }
  );
  if (run.status !== 0)
    throw new Error(run.stderr || 'Actual adapter fixture failed');
  return JSON.parse(run.stdout);
}
