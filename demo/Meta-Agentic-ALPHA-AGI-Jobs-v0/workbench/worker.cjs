'use strict';
const path = require('node:path');
const { readJson } = require('./io.cjs');
async function main() {
  const { makeTask, json } = await import('./model.mjs');
  const {
    parseComputerWorkTask,
    computerTaskDigest,
    computerWorkHandler,
  } = require('../../../apps/orchestrator/computerWork.ts');
  const [mode, stage, jobId, extra] = process.argv.slice(2);
  if (
    extra ||
    !stage ||
    (mode === 'inspect' ? Boolean(jobId) : mode !== 'run' || !jobId)
  )
    throw new Error('Usage: worker.cjs inspect STAGE_ID | run STAGE_ID JOB_ID');
  const task = parseComputerWorkTask(
    await makeTask(readJson(path.join(__dirname, 'scenario.json')), stage)
  );
  if (mode === 'inspect') {
    console.log(
      json({ task, taskSha256: computerTaskDigest(task), admitted: false })
    );
    return;
  }
  const receipt = await computerWorkHandler({
    context: {
      jobId,
      category: 'computer-work',
      tags: ['meta-agentic-alpha', 'synthetic'],
      metadata: { computerWork: task },
    },
  });
  console.log(json(receipt));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
