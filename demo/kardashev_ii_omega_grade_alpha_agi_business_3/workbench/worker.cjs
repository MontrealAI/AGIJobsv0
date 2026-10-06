'use strict';
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { readJson } = require('./io.cjs');
async function main() {
  const { makeTask } = await import(
    pathToFileURL(path.join(__dirname, 'core.mjs'))
  );
  const {
    parseComputerWorkTask,
    computerTaskDigest,
    computerWorkHandler,
  } = require('../../../apps/orchestrator/computerWork.ts');
  const [mode, ...args] = process.argv.slice(2);
  let task, jobId;
  if (
    (mode === 'inspect-file' && args.length === 1) ||
    (mode === 'run-file' && args.length === 2)
  ) {
    task = parseComputerWorkTask(readJson(args[0]));
    jobId = args[1];
  } else if (
    (mode === 'inspect' && args.length === 2) ||
    (mode === 'run' && args.length === 3)
  ) {
    task = parseComputerWorkTask(await makeTask(args[0], args[1]));
    jobId = args[2];
  } else
    throw new Error(
      'Usage: worker.cjs inspect TEMPLATE FAMILY | run TEMPLATE FAMILY JOB_ID | inspect-file TASK.json | run-file TASK.json JOB_ID'
    );
  if (mode.startsWith('inspect')) {
    console.log(
      JSON.stringify(
        { task, taskSha256: computerTaskDigest(task), admitted: false },
        null,
        2
      )
    );
    return;
  }
  const receipt = await computerWorkHandler({
    context: {
      jobId,
      category: 'computer-work',
      tags: ['kardashev-business', task.dataClass],
      metadata: { computerWork: task },
    },
  });
  console.log(JSON.stringify(receipt, null, 2));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
