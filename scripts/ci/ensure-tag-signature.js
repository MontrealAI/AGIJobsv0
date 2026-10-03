#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe' }).trim();
}

const ref = process.argv[2];
if (!ref) fail('Tag reference argument is required.');
const tagName = ref.startsWith('refs/tags/') ? ref.slice(10) : ref;
const tagRef = `refs/tags/${tagName}`;
const signersPath = path.resolve(
  process.env.GIT_ALLOWED_SIGNERS || '.github/signers/allowed_signers'
);

try {
  git(['check-ref-format', tagRef]);
  if (!fs.existsSync(signersPath)) {
    fail(`Maintainer signing keys not found at ${signersPath}.`);
  }
  execFileSync(
    process.execPath,
    [path.join(__dirname, 'check-signers.js'), signersPath],
    {
      stdio: 'pipe',
    }
  );
  if (git(['cat-file', '-t', tagRef]) !== 'tag') {
    fail(`Tag ${tagName} must be an annotated, SSH-signed release tag.`);
  }
  const payload = git(['cat-file', 'tag', tagRef]);
  if (!payload.includes('-----BEGIN SSH SIGNATURE-----')) {
    fail(
      `Tag ${tagName} needs an SSH signature authorized by the maintainer registry.`
    );
  }
  const tagCommit = git(['rev-parse', '--verify', `${tagRef}^{commit}`]);
  const checkoutCommit = git(['rev-parse', '--verify', 'HEAD']);
  if (tagCommit !== checkoutCommit) {
    fail(
      `Tag ${tagName} does not point to the checked-out commit. Check out the signed tag before releasing.`
    );
  }
  git([
    '-c',
    `gpg.ssh.allowedSignersFile=${signersPath}`,
    'verify-tag',
    '--',
    tagRef,
  ]);
  console.log(`✅ Verified SSH signature and checkout commit for ${tagName}.`);
} catch (error) {
  const detail = error.stderr?.toString().trim() || error.message;
  fail(`Release provenance verification failed: ${detail}`);
}
