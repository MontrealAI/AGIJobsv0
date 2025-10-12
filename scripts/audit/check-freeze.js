#!/usr/bin/env node
const { execSync } = require('child_process');

function run(command) {
  return execSync(command, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
}

function fail(message, extra = {}) {
  const payload = { status: 'failed', reason: message, ...extra };
  console.error(`\n❌  audit:freeze check failed\n${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
}

function ok(summary) {
  console.log(`\n✅  audit:freeze ready\n${JSON.stringify(summary, null, 2)}\n`);
}

function main() {
  const expectedBranch = process.env.AUDIT_FREEZE_BRANCH || 'main';
  const allowBranchOverride = process.env.AUDIT_FREEZE_ALLOW_BRANCH === '1';
  const allowDirty = process.env.AUDIT_FREEZE_ALLOW_DIRTY === '1';

  let branch;
  try {
    branch = run('git rev-parse --abbrev-ref HEAD');
  } catch (error) {
    fail('Unable to determine current branch. Ensure git is installed and repository is accessible.');
  }

  if (!allowBranchOverride && branch !== expectedBranch) {
    fail('Current branch does not match expected freeze branch.', { branch, expectedBranch });
  }

  let status;
  try {
    status = run('git status --porcelain --untracked-files=all');
  } catch (error) {
    fail('Unable to read git status. Ensure repository is not in the middle of a merge/rebase.');
  }

  if (!allowDirty && status.length > 0) {
    const files = status.split('\n').filter(Boolean).slice(0, 20);
    fail('Working tree must be clean before initiating the audit freeze.', { dirtyFiles: files });
  }

  let upstream = null;
  try {
    upstream = run('git rev-parse --abbrev-ref --symbolic-full-name @{u}');
  } catch (error) {
    upstream = null;
  }

  if (upstream) {
    try {
      run('git remote update --prune');
    } catch (error) {
      if (process.env.AUDIT_FREEZE_IGNORE_FETCH !== '1') {
        fail('Failed to fetch remote updates. Set AUDIT_FREEZE_IGNORE_FETCH=1 to skip this check in air-gapped environments.');
      }
    }

    if (process.env.AUDIT_FREEZE_IGNORE_FETCH !== '1') {
      const divergence = run(`git rev-list --left-right --count ${upstream}...HEAD`);
      const [behindStr, aheadStr] = divergence.split('\t');
      const behind = Number.parseInt(behindStr, 10);
      const ahead = Number.parseInt(aheadStr, 10);
      if (Number.isFinite(behind) && behind > 0) {
        fail('Local branch is behind upstream. Pull the latest audited commit before freezing.', { upstream, behind, ahead });
      }
      if (Number.isFinite(ahead) && ahead > 0) {
        fail('Local branch has unpushed commits. Push or archive them before the audit freeze.', { upstream, ahead, behind });
      }
    }
  }

  ok({
    branch,
    expectedBranch,
    upstream: upstream || 'none',
    fetched: process.env.AUDIT_FREEZE_IGNORE_FETCH === '1' ? 'skipped' : Boolean(upstream),
    clean: status.length === 0,
  });
}

main();
