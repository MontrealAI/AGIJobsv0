#!/usr/bin/env node
'use strict';
const {
  computerTaskDigest,
  parseComputerWorkTask,
  computerWorkHandler,
} = require('../../../apps/orchestrator/computerWork.ts');
const task = parseComputerWorkTask(require('./task.json'));
async function main() {
  const [mode, jobId, ...extra] = process.argv.slice(2);
  if (mode === 'inspect' && !jobId) {
    console.log(
      JSON.stringify(
        { task, taskSha256: computerTaskDigest(task), admitted: false },
        null,
        2
      )
    );
    return;
  }
  if (mode !== 'run' || !jobId || extra.length)
    throw new Error('Usage: node --import tsx worker.cjs inspect | run JOB_ID');
  const receipt = await computerWorkHandler({
    context: {
      jobId,
      category: 'computer-work',
      tags: ['synthesis', 'synthetic'],
      metadata: { computerWork: task },
    },
  });
  console.log(JSON.stringify(receipt, null, 2));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
