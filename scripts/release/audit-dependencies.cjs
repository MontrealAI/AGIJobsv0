#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile, execFileSync } = require('node:child_process');

const auditEnvironment = {
  npm_config_fetch_retries: '0',
  npm_config_fetch_timeout: '30000',
  npm_config_fetch_retry_mintimeout: '1000',
  npm_config_fetch_retry_maxtimeout: '1000',
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
};

function assessAudit(result) {
  if (result.error) throw new Error(`Audit command failed: ${result.error}`);
  let data;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new Error('Audit returned invalid JSON');
  }
  if (data.error) throw new Error('Registry audit returned an error');
  const counts = data.metadata?.vulnerabilities;
  for (const severity of ['low', 'moderate', 'high', 'critical']) {
    if (!Number.isSafeInteger(counts?.[severity]) || counts[severity] < 0)
      throw new Error(`Audit lacks valid ${severity} vulnerability evidence`);
  }
  if (![0, 1].includes(result.status))
    throw new Error(`Audit exited unexpectedly (${result.status})`);
  if (counts.high || counts.critical)
    throw new Error(
      `${counts.critical} critical / ${counts.high} high findings`
    );
  if (result.status !== 0)
    throw new Error(
      'Audit failed despite reporting no high or critical findings'
    );
  return counts;
}

function auditCommand(lockfile, root) {
  if (path.basename(lockfile) === 'package-lock.json')
    return [
      'npm',
      'audit',
      '--package-lock-only',
      '--omit=dev',
      '--json',
      '--audit-level=high',
    ];
  if (path.basename(lockfile) !== 'pnpm-lock.yaml')
    throw new Error(`Unsupported lockfile: ${lockfile}`);
  const pkg = JSON.parse(
    fs.readFileSync(
      path.join(root, path.dirname(lockfile), 'package.json'),
      'utf8'
    )
  );
  if (
    !/^pnpm@\d+\.\d+\.\d+(?:\+sha\d+\.[a-f\d]+)?$/.test(
      pkg.packageManager || ''
    )
  )
    throw new Error(
      `An exact pnpm packageManager pin is required for ${lockfile}`
    );
  return [
    'corepack',
    'pnpm',
    'audit',
    '--prod',
    '--json',
    '--audit-level',
    'high',
  ];
}

function runCommand(command, cwd) {
  return new Promise((resolve) => {
    execFile(
      command[0],
      command.slice(1),
      {
        cwd,
        env: { ...process.env, ...auditEnvironment },
        encoding: 'utf8',
        timeout: 45_000,
        killSignal: 'SIGKILL',
        maxBuffer: 32 * 1024 * 1024,
      },
      (error, stdout, stderr) =>
        resolve({
          stdout,
          stderr,
          status: error
            ? Number.isInteger(error.code)
              ? error.code
              : null
            : 0,
          error:
            error && (error.killed || !Number.isInteger(error.code))
              ? error.message
              : null,
        })
    );
  });
}

const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function auditProjects({ root, lockfiles, output, run = runCommand }) {
  if (!lockfiles.includes('package-lock.json'))
    throw new Error('The tracked root package-lock.json is required');
  fs.mkdirSync(output, { recursive: true });
  const results = new Array(lockfiles.length);
  let cursor = 0;
  async function worker() {
    while (cursor < lockfiles.length) {
      const index = cursor++;
      const lockfile = lockfiles[index];
      const prefix = String(index + 1).padStart(2, '0');
      const entry = {
        lockfile,
        status: 'failed',
        startedAt: new Date().toISOString(),
        stdout: `${prefix}.json`,
        stderr: `${prefix}.stderr.txt`,
      };
      results[index] = entry;
      try {
        entry.lockfileSha256 = hash(path.join(root, lockfile));
        const manifest = path.join(
          root,
          path.dirname(lockfile),
          'package.json'
        );
        entry.manifestSha256 = hash(manifest);
        entry.command = auditCommand(lockfile, root);
        const result = await run(
          entry.command,
          path.join(root, path.dirname(lockfile))
        );
        fs.writeFileSync(path.join(output, entry.stdout), result.stdout || '');
        fs.writeFileSync(path.join(output, entry.stderr), result.stderr || '');
        entry.exitCode = result.status;
        entry.vulnerabilities = assessAudit(result);
        if (
          entry.lockfileSha256 !== hash(path.join(root, lockfile)) ||
          entry.manifestSha256 !== hash(manifest)
        )
          throw new Error('Dependency inputs changed during the audit');
        entry.status = 'passed';
      } catch (error) {
        entry.error = error.message;
      }
      entry.finishedAt = new Date().toISOString();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(4, lockfiles.length) }, worker)
  );
  return results;
}

async function main() {
  if (process.argv.length > 2)
    throw new Error('Usage: node scripts/release/audit-dependencies.cjs');
  const root = path.resolve(__dirname, '../..');
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const lockfiles = git(
    'ls-files',
    '-z',
    '--',
    '*package-lock.json',
    '*pnpm-lock.yaml'
  )
    .split('\0')
    .filter(Boolean)
    .sort();
  const output = path.join(root, 'reports/release/dependency-audit');
  fs.mkdirSync(output, { recursive: true });
  const report = {
    schemaVersion: 1,
    status: 'failed',
    scope: 'Production dependencies in every tracked npm and pnpm lockfile',
    policy:
      'Reject critical/high findings, failed commands and missing evidence. No advisory allowlist.',
    source: {
      commit: git('rev-parse', 'HEAD'),
      tree: git('rev-parse', 'HEAD^{tree}'),
      dirty: Boolean(git('status', '--porcelain', '--untracked-files=no')),
    },
    nodeVersion: process.version,
    startedAt: new Date().toISOString(),
    audits: [],
  };
  try {
    report.audits = await auditProjects({ root, lockfiles, output });
    const failed = report.audits.filter((entry) => entry.status !== 'passed');
    if (failed.length)
      throw new Error(
        failed.map((entry) => `${entry.lockfile}: ${entry.error}`).join('\n')
      );
    report.status = 'passed';
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(
      path.join(output, 'summary.json'),
      `${JSON.stringify(report, null, 2)}\n`
    );
  }
  console.log(
    `Production dependency audit passed for ${lockfiles.length} lockfiles. Evidence: ${output}`
  );
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { assessAudit, auditCommand, auditProjects };
