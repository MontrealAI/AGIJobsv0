#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { sealBundle } = require('./evidence.cjs');
const { checkCommissioning } = require('./commissioning.cjs');
const root = path.resolve(__dirname, '../..');
const node = process.execPath;
const environment = Object.fromEntries(
  [
    'PATH',
    'HOME',
    'TMPDIR',
    'TEMP',
    'TMP',
    'LANG',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'no_proxy',
    'SSL_CERT_FILE',
    'NODE_EXTRA_CA_CERTS',
  ]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]])
);
Object.assign(environment, {
  CI: '1',
  TZ: 'UTC',
  NODE_OPTIONS: '--max-old-space-size=4096 --no-experimental-strip-types',
  TS_NODE_COMPILER_OPTIONS: '{"module":"commonjs"}',
});
const git = (...args) =>
  execFileSync('git', ['-C', root, ...args], {
    env: environment,
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim();
const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => abort.abort());
const boundaries = [
  'Signing uses disposable fixture keys. Maintainer identity and authorization are not simulated into existence.',
  'Provider contracts use real HTTP against local fault-injection fixtures. Live service quality, privacy, billing, and durability remain unproven.',
  'Security checks are automated adversarial self-review. An independent audit and review of documented static-analysis exceptions remain required.',
  'Commissioning uses chain 31337, public local identities, mock tokens, and synthetic work. It proves neither mainnet operation nor validator independence.',
];
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        char
      ])
  );
function html(report) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AGI Jobs — Production rehearsal</title><style>body{font:17px/1.6 system-ui;margin:0;background:#100b22;color:#eee9ff}main{max-width:1050px;margin:auto;padding:36px 24px}h1{font-size:2.3rem;line-height:1.2}a{color:#cdb4ff}table{border-collapse:collapse;width:100%;background:#1e1534}td,th{text-align:left;border-bottom:1px solid #49365f;padding:12px}code{overflow-wrap:anywhere}.label{display:inline-block;border:1px solid #ac81ec;border-radius:8px;padding:6px 12px}.note{background:#2c2044;padding:18px;border-left:4px solid #ac81ec}li{margin-bottom:10px}</style><main><p class="label">SIMULATION EVIDENCE · NO PRODUCTION APPROVAL</p><h1>AGI Jobs production rehearsal</h1><p>Outcome: <strong>${escape(
    report.status.toUpperCase()
  )}</strong> · ${escape(report.finishedAt)}</p><p>Source commit <code>${escape(
    report.source.commit
  )}</code><br>Source tree <code>${escape(
    report.source.tree
  )}</code></p><p class="note">These checks exercise actual code, cryptography, HTTP transports, and local-chain transactions. They do not establish an authentic release signature, independent review, or live production commissioning.</p><table><thead><tr><th>Check</th><th>Result</th><th>Evidence</th></tr></thead><tbody>${report.checks
    .map(
      (check) =>
        `<tr><td>${escape(check.title)}</td><td>${escape(
          check.status
        )}</td><td>${
          check.log
            ? `<a href="${escape(check.log)}">Open log</a>`
            : 'Structured report'
        }</td></tr>`
    )
    .join(
      ''
    )}</tbody></table><h2>What still requires real evidence</h2><ul>${boundaries
    .map((line) => `<li>${escape(line)}</li>`)
    .join(
      ''
    )}</ul><p><a href="report.json">Machine-readable report</a> · <a href="manifest.json">File hashes</a> · <a href="manifest.json.sig">Ephemeral SSH signature</a></p><p>Verify with <code>npm run production:verify-rehearsal -- &lt;this-directory&gt;</code>. The bundled public key checks integrity only; an attacker who replaces the entire bundle and its key can create another self-signed bundle. Preserve the original artifact digest through a trusted channel.</p></main></html>`;
}
async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--help') {
    console.log(
      'Usage: npm run production:rehearse [-- --output <new-directory>]\nRequires a clean committed checkout, npm ci, Git, OpenSSH, and Bash. Uses an isolated worktree; no production credentials are needed.'
    );
    return;
  }
  if (args.length && (args.length !== 2 || args[0] !== '--output'))
    throw new Error('Unknown arguments; use --help');
  if (git('status', '--porcelain', '--untracked-files=normal'))
    throw new Error(
      'Commit or set aside local changes first. The rehearsal validates an exact committed checkout.'
    );
  if (!fs.existsSync(path.join(root, 'node_modules')))
    throw new Error('Run npm ci first.');
  const commit = git('rev-parse', 'HEAD'),
    tree = git('rev-parse', 'HEAD^{tree}');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output = path.resolve(
    args[1] ||
      path.join(
        root,
        'reports/production-rehearsal',
        `${stamp}-${commit.slice(0, 12)}`
      )
  );
  if (fs.existsSync(output))
    throw new Error(
      'Output directory already exists; choose a new directory to retain prior evidence.'
    );
  fs.mkdirSync(path.join(output, 'logs'), { recursive: true });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agijobs-rehearsal-'));
  const checkout = path.join(temp, 'checkout');
  let added = false;
  const report = {
    schemaVersion: 1,
    kind: 'production-rehearsal',
    evidenceClass: 'simulation',
    productionApproved: false,
    independentReview: false,
    status: 'failed',
    source: { commit, tree },
    startedAt: new Date().toISOString(),
    finishedAt: null,
    checks: [],
    boundaries,
  };
  async function stage(
    id,
    title,
    command,
    extraEnv = {},
    timeoutMs = 20 * 60_000
  ) {
    if (abort.signal.aborted) throw new Error('Rehearsal interrupted');
    const check = {
      id,
      title,
      command,
      status: 'failed',
      exitCode: null,
      startedAt: new Date().toISOString(),
      log: `logs/${id}.log`,
    };
    report.checks.push(check);
    console.log(`▶ ${title}`);
    const fd = fs.openSync(path.join(output, check.log), 'w');
    try {
      const code = await new Promise((resolve, reject) => {
        const child = spawn(command[0], command.slice(1), {
          cwd: checkout,
          env: { ...environment, ...extraEnv },
          detached: process.platform !== 'win32',
          stdio: ['ignore', fd, fd],
        });
        let forceTimer;
        const kill = (signal) => {
          try {
            if (process.platform === 'win32') child.kill(signal);
            else process.kill(-child.pid, signal);
          } catch {}
        };
        const stop = () => {
          kill('SIGTERM');
          forceTimer = setTimeout(() => kill('SIGKILL'), 5000);
        };
        const timer = setTimeout(stop, timeoutMs);
        abort.signal.addEventListener('abort', stop, { once: true });
        child.once('error', (error) => {
          clearTimeout(timer);
          clearTimeout(forceTimer);
          abort.signal.removeEventListener('abort', stop);
          reject(error);
        });
        child.once('close', (exitCode, signal) => {
          clearTimeout(timer);
          clearTimeout(forceTimer);
          abort.signal.removeEventListener('abort', stop);
          resolve(signal ? 128 : exitCode);
        });
      });
      check.exitCode = code;
      if (code !== 0) throw new Error(`${title} failed; see ${check.log}`);
      check.status = 'passed';
      console.log(`✓ ${title}`);
    } finally {
      fs.closeSync(fd);
      check.finishedAt = new Date().toISOString();
    }
  }
  try {
    git('worktree', 'add', '--detach', checkout, commit);
    added = true;
    fs.symlinkSync(
      fs.realpathSync(path.join(root, 'node_modules')),
      path.join(checkout, 'node_modules'),
      'dir'
    );
    const hardhat = [node, 'node_modules/hardhat/internal/cli/cli.js'];
    await stage('toolchain', 'Toolchain and lockfile integrity', [
      'npm',
      'run',
      'ci:preflight',
    ]);
    await stage(
      'release-defenses',
      'SSH signing and release-evidence rejection scenarios',
      [
        node,
        '--test',
        'test/scripts/release-provenance.test.cjs',
        'test/scripts/release-ci.test.cjs',
        'test/scripts/release-inventory.test.cjs',
      ]
    );
    await stage(
      'gateway-build',
      'Build the production gateway and runtime assets',
      ['npm', 'run', 'build:gateway']
    );
    await stage(
      'provider-contracts',
      'Real HTTP agent and IPFS adapter fault injection',
      [node, '--test', 'test/scripts/provider-contracts.test.cjs']
    );
    await stage('compile', 'Compile contracts with production size limits', [
      'npm',
      'run',
      'compile',
      '--',
      '--concurrency',
      '1',
    ]);
    await stage(
      'contract-size',
      'Check every production artifact against EIP-170/EIP-3860',
      [node, 'scripts/release/check-contract-size.js', '--json']
    );
    await stage(
      'adversarial-controls',
      'Deployment recovery, ownership, pause, escrow and reentrancy',
      [
        ...hardhat,
        'test',
        '--no-compile',
        'test/v2/FixedImplementations.test.js',
        'test/v2/SystemPause.test.js',
        'test/v2/JobEscrow.test.js',
        'test/v2/StakeManagerReentrancy.test.js',
        'test/v2/ValidationModuleReentrancy.test.js',
      ]
    );
    await stage(
      'execution-gates',
      'Reject failed-provider and unauthorized synthetic submissions',
      [...hardhat, 'test', '--no-compile', 'test/taskExecution.test.ts']
    );
    const port = await availablePort();
    await stage(
      'local-commissioning',
      'Commission three jobs with actual local contract settlement',
      ['bash', 'demo/asi-takeoff/bin/asi-takeoff-local.sh'],
      { DEMO_PORT: String(port), AURORA_REPORT_SCOPE: 'production-rehearsal' }
    );
    const receipts = path.join(
      checkout,
      'reports/localhost/production-rehearsal/receipts'
    );
    const evidenceCheck = {
      id: 'commissioning-evidence',
      title:
        'Validate all job receipts, validator reveals, payouts and deployed implementation records',
      status: 'failed',
      exitCode: 1,
    };
    report.checks.push(evidenceCheck);
    report.commissioning = checkCommissioning(receipts);
    fs.cpSync(receipts, path.join(output, 'receipts'), { recursive: true });
    evidenceCheck.status = 'passed';
    evidenceCheck.exitCode = 0;
    report.status = 'passed';
  } catch (error) {
    report.error = error.message;
    if (!report.checks.length)
      report.checks.push({
        id: 'setup',
        title: 'Isolated checkout setup',
        status: 'failed',
        exitCode: 1,
      });
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    if (added)
      fs.writeFileSync(
        path.join(output, 'local-fixture-changes.patch'),
        execFileSync('git', ['-C', checkout, 'diff', '--binary'], {
          env: environment,
          encoding: 'utf8',
        })
      );
    fs.writeFileSync(
      path.join(output, 'report.json'),
      JSON.stringify(report, null, 2) + '\n'
    );
    fs.writeFileSync(path.join(output, 'index.html'), html(report));
    try {
      sealBundle(output, temp);
    } finally {
      try {
        if (added) git('worktree', 'remove', '--force', checkout);
      } finally {
        fs.rmSync(temp, { recursive: true, force: true });
      }
    }
    console.log(
      `Rehearsal ${report.status}: ${path.join(output, 'index.html')}`
    );
    console.log(
      'Production approval: false. Independent security review: false.'
    );
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
