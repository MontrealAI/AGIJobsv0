#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const parseDuration = require('../../../scripts/utils/parseDuration.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveRepoRoot() {
  return path.resolve(__dirname, '../../..');
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

async function detectPythonVersion(binary) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['--version']);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(`Unable to query ${binary} version (exit ${code})`));
      }
    });
  });
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const demoRoot = path.join(repoRoot, 'demo', 'Huxley-Godel-Machine-v0');
  const reportsRoot = process.env.HGM_REPORT_DIR || path.join(demoRoot, 'reports', 'guided');
  const pythonBinary = process.env.PYTHON_BIN || process.env.PYTHON || 'python3';
  const paceRaw = process.env.HGM_GUIDED_PACE || '2.2s';
  const paceMs = parseDuration(paceRaw, 'ms') ?? 2200;
  const args = process.argv.slice(2);

  console.log('══════════════════════════════════════════════════════════════');
  console.log('        Huxley–Gödel Machine :: Guided Operator Launcher       ');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`↪ repository root : ${repoRoot}`);
  console.log(`↪ demo workspace  : ${demoRoot}`);
  console.log(`↪ reports dir     : ${reportsRoot}`);
  console.log(`↪ python binary   : ${pythonBinary}`);
  console.log(`↪ guided pace     : ${paceMs}ms (source: ${paceRaw})`);

  await wait(paceMs);

  let version;
  try {
    version = await detectPythonVersion(pythonBinary);
    console.log(`✓ detected interpreter :: ${version}`);
  } catch (error) {
    console.error('✗ unable to detect Python interpreter. Ensure Python 3.10+ is installed.');
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  await wait(paceMs);

  fs.mkdirSync(reportsRoot, { recursive: true });
  console.log('✓ ensured reports directory exists');

  await wait(paceMs);

  const env = {
    ...process.env,
    HGM_GUIDED_MODE: '1',
    HGM_GUIDED_PACE_MS: String(paceMs),
    PYTHONPATH: [path.join(demoRoot, 'src'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
  };

  const pythonArgs = [path.join(demoRoot, 'run_demo.py'), '--output-dir', reportsRoot, ...args];

  console.log('♪ Launching simulation in guided mode…');
  await wait(Math.min(paceMs, 1500));

  try {
    await runCommand(pythonBinary, pythonArgs, { cwd: repoRoot, env });
    console.log('\n★ Guided run complete. Explore the generated timeline, summary, and Markdown dossiers.');
  } catch (error) {
    console.error('\n✗ Guided run failed. Inspect the logs above for details.');
    console.error(error.message);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Unexpected launcher failure:', error);
  process.exitCode = 1;
});
