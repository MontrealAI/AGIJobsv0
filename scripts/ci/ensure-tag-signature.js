#!/usr/bin/env node
/*
 * Enforce that release tags carry a cryptographic signature before
 * the release workflow proceeds. The script verifies that the tag
 * contains a signature block and, when an allowed signers file is
 * present, validates the signature using `git tag -v`.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function run(command, options = {}) {
  return execSync(command, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  }).trim();
}

const ref = process.argv[2];
if (!ref) {
  fail('Tag reference argument is required.');
}

const tagName = ref.startsWith('refs/tags/')
  ? ref.slice('refs/tags/'.length)
  : ref;

try {
  run(`git rev-parse --verify refs/tags/${tagName}`);
} catch (error) {
  fail(`Tag ${tagName} not found in checkout: ${error.message}`);
}

let signatureBlock = '';
try {
  signatureBlock = run(
    `git for-each-ref --format='%(contents:signature)' refs/tags/${tagName}`
  );
} catch (error) {
  fail(`Unable to inspect tag signature metadata: ${error.message}`);
}

if (!signatureBlock) {
  fail(`Tag ${tagName} is missing a cryptographic signature.`);
}

console.log(`✅ Detected signature payload on tag ${tagName}.`);

const allowedSignersFromEnv = process.env.GIT_ALLOWED_SIGNERS;
const defaultAllowedSigners = path.join(
  '.github',
  'signers',
  'allowed_signers'
);
const allowedSignersPath = allowedSignersFromEnv || defaultAllowedSigners;

if (fs.existsSync(allowedSignersPath)) {
  try {
    run(`git config gpg.ssh.allowedSignersFile "${allowedSignersPath}"`);
    execSync(`git tag -v ${tagName}`, { stdio: 'inherit' });
    console.log(`✅ git tag -v succeeded using ${allowedSignersPath}.`);
  } catch (error) {
    fail(`Signature verification failed for tag ${tagName}: ${error.message}`);
  }
} else {
  console.warn(
    `::warning::Skipping git tag -v verification because ${allowedSignersPath} was not found. ` +
      'Add maintainer signing keys to enable strict validation.'
  );
}
