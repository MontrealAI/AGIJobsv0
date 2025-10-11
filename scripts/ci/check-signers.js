#!/usr/bin/env node
/**
 * Validates the maintainer signing keys used to verify release tags.
 * The script enforces format and namespace constraints so production
 * releases always ship with verifiable provenance.
 */

const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error(`\u001b[31m✖ ${message}\u001b[0m`);
  process.exit(1);
}

function ok(message) {
  console.log(`\u001b[32m✔ ${message}\u001b[0m`);
}

const DEFAULT_SIGNERS_PATH = path.join('.github', 'signers', 'allowed_signers');
const signersPath =
  process.env.ALLOWED_SIGNERS_PATH || process.argv[2] || DEFAULT_SIGNERS_PATH;

if (!fs.existsSync(signersPath)) {
  fail(
    `Maintainer signing key file not found at ${signersPath}. ` +
      'Populate the path with hardware-backed SSH or GPG keys so release CI can verify signed tags.'
  );
}

const raw = fs.readFileSync(signersPath, 'utf8');
const lines = raw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));

if (lines.length === 0) {
  fail(
    `No maintainer keys detected in ${signersPath}. ` +
      'Add at least one signing key to unlock release provenance checks.'
  );
}

const keyPattern =
  '([^\\s#]+)\\s+namespaces="([^"]+)"\\s+' +
  '(sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com|ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa)\\s+' +
  '([A-Za-z0-9+/=]+)(?:\\s+.+)?';
const keyRegex = new RegExp(`^${keyPattern}$`);
const fingerprints = new Map();

lines.forEach((line, index) => {
  const match = line.match(keyRegex);
  if (!match) {
    fail(
      `Line ${
        index + 1
      } in ${signersPath} is not a valid allowed_signers entry. ` +
        'Expected: <principal> namespaces="git" <key-type> <base64-key> [comment]'
    );
  }

  const [, principal, namespaces, keyType, keyData] = match;

  if (!namespaces.split(/\s+/).includes('git')) {
    fail(
      `Line ${
        index + 1
      } (${principal}) must include the "git" namespace so git tag -v can verify release tags.`
    );
  }

  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(keyData)) {
      throw new Error('contains characters outside the base64 alphabet');
    }

    const buffer = Buffer.from(keyData, 'base64');
    if (buffer.length === 0) {
      throw new Error('decoded length is zero');
    }

    const normalized = buffer.toString('base64');
    if (normalized.replace(/=+$/, '') !== keyData.replace(/=+$/, '')) {
      throw new Error('round-trip encoding mismatch');
    }

    const fingerprint = `${keyType}:${normalized}`;
    if (fingerprints.has(fingerprint)) {
      const existing = fingerprints.get(fingerprint);
      fail(
        `Duplicate signing key detected between entries ${existing} and ${
          index + 1
        }. ` + 'Remove redundant keys to avoid ambiguous provenance.'
      );
    }
    fingerprints.set(fingerprint, index + 1);
  } catch (error) {
    fail(
      `Line ${
        index + 1
      } (${principal}) contains an invalid base64 key payload: ${error.message}`
    );
  }
});

ok(
  `${lines.length} maintainer signing entr${
    lines.length === 1 ? 'y' : 'ies'
  } validated successfully at ${signersPath}.`
);
ok(
  'Release workflows can verify tag signatures against the committed key list.'
);
