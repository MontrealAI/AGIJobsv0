#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

function run(command) {
  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.status !== 0) {
    const errorOutput = (result.stderr || result.stdout || '').trim();
    throw new Error(errorOutput ? `Command failed (${command}): ${errorOutput}` : `Command failed (${command})`);
  }

  return result.stdout.trim();
}

function main() {
  const ref = process.env.GITHUB_REF || '';
  let tagName = '';

  if (ref.startsWith('refs/tags/')) {
    tagName = ref.substring('refs/tags/'.length);
  } else {
    try {
      tagName = run('git describe --exact-match --tags');
    } catch (error) {
      console.log('ℹ️ No Git tag detected for this workflow run; skipping signature verification.');
      return;
    }
  }

  if (!tagName) {
    console.log('ℹ️ No Git tag detected for this workflow run; skipping signature verification.');
    return;
  }

  const tagType = run(`git cat-file -t ${tagName}`);
  if (tagType !== 'tag') {
    console.error(`❌ Tag "${tagName}" is lightweight (${tagType}). Create an annotated, signed tag.`);
    process.exit(1);
  }

  const payloadResult = spawnSync(`git cat-file -p ${tagName}`, {
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (payloadResult.status !== 0) {
    const errorOutput = (payloadResult.stderr || payloadResult.stdout || '').trim();
    console.error(`❌ Unable to inspect tag "${tagName}": ${errorOutput}`);
    process.exit(1);
  }

  const payload = payloadResult.stdout;
  const signatureMarkers = [
    '-----BEGIN PGP SIGNATURE-----',
    '-----BEGIN SSH SIGNATURE-----',
    '-----BEGIN OPENSSH SIGNATURE-----'
  ];

  const hasSignature = signatureMarkers.some((marker) => payload.includes(marker));
  if (!hasSignature) {
    console.error(
      `❌ Tag "${tagName}" is annotated but not signed. Use \`git tag -s\` (GPG) or configure \`gpg.format=ssh\` for SSH signing.`
    );
    process.exit(1);
  }

  console.log(`✅ Verified that tag "${tagName}" contains a cryptographic signature.`);
}

main();
