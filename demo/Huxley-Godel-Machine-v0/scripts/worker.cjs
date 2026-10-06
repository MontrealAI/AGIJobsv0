'use strict';
const fs = require('node:fs');
const path = require('node:path');
function read(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024)
      throw new Error('Use a regular JSON file smaller than 8 MiB');
    return JSON.parse(fs.readFileSync(fd, 'utf8'));
  } finally {
    fs.closeSync(fd);
  }
}
async function main() {
  const { makeTask, analyse, review, json } = await import('../web/model.mjs');
  const [mode, record, arg, extra] = process.argv.slice(2);
  if (
    extra ||
    !record ||
    !['inspect', 'run', 'analyse', 'review'].includes(mode) ||
    (['run', 'review'].includes(mode) ? !arg : Boolean(arg))
  )
    throw new Error(
      'Usage: worker.cjs inspect RECORD.json | analyse RECORD.json | review RECORD.json CANDIDATE.json | run RECORD.json JOB_ID'
    );
  const data = read(record);
  if (mode === 'analyse') {
    console.log(json(await analyse(data)));
    return;
  }
  if (mode === 'review') {
    const checked = await review(data, read(arg));
    console.log(json(checked));
    if (!checked.accepted) process.exitCode = 1;
    return;
  }
  const {
    parseComputerWorkTask,
    computerTaskDigest,
    computerWorkHandler,
  } = require('../../../apps/orchestrator/computerWork.ts');
  const task = parseComputerWorkTask(await makeTask(data));
  if (mode === 'inspect') {
    console.log(
      json({ task, taskSha256: computerTaskDigest(task), admitted: false })
    );
    return;
  }
  const receipt = await computerWorkHandler({
    context: {
      jobId: arg,
      category: 'computer-work',
      tags: ['hgm', 'synthetic'],
      metadata: { computerWork: task },
    },
  });
  console.log(json(receipt));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
