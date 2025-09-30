#!/usr/bin/env node
const { spawnSync } = require('child_process');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const joined = [command].concat(args || []).join(' ');
    throw new Error(`Command failed (${result.status}): ${joined}`);
  }
}

try {
  console.log('[subgraph:e2e] Building mapping and schema...');
  run('npm', ['run', '--prefix', 'subgraph', 'build'], {
    env: process.env,
  });

  console.log('[subgraph:e2e] Replaying events with matchstick (graph test)...');
  run('subgraph/node_modules/.bin/graph', ['test', '--recompile'], {
    env: process.env,
  });

  console.log('[subgraph:e2e] Completed successfully.');
} catch (err) {
  console.error('[subgraph:e2e] Failed:', err.message);
  process.exit(1);
}
