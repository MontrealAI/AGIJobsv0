#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function usage() {
  return `Usage: node scripts/release/validate-manifest.js [options]\n\n` +
    `Options:\n` +
    `  --manifest <path>          Path to the manifest JSON (default reports/release/manifest.json)\n` +
    `  --fail-on-warnings         Treat manifest warnings as errors\n` +
    `  --allow-warning <message>  Allow a specific warning string (can be repeated)\n` +
    `  --require-addresses        Require non-zero config addresses for all contracts\n` +
    `  --optional-contract <name> Allow a contract to skip address requirements (repeatable)\n` +
    `  --no-toolchain-check       Do not enforce toolchain metadata\n` +
    `  --no-git-check             Do not enforce git metadata\n` +
    `  --help                     Show this message`;
}

function parseArgs(argv) {
  const options = {
    manifestPath: path.resolve(process.cwd(), 'reports/release/manifest.json'),
    failOnWarnings: false,
    allowedWarnings: new Set(),
    requireAddresses: false,
    optionalContracts: new Set(),
    enforceToolchain: true,
    enforceGit: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    switch (current) {
      case '--manifest':
        if (typeof argv[i + 1] !== 'string') {
          throw new Error('--manifest requires a path argument');
        }
        options.manifestPath = path.resolve(process.cwd(), argv[i + 1]);
        i += 1;
        break;
      case '--fail-on-warnings':
        options.failOnWarnings = true;
        break;
      case '--allow-warning':
        if (typeof argv[i + 1] !== 'string') {
          throw new Error('--allow-warning requires a warning message');
        }
        options.allowedWarnings.add(argv[i + 1]);
        i += 1;
        break;
      case '--require-addresses':
        options.requireAddresses = true;
        break;
      case '--optional-contract':
        if (typeof argv[i + 1] !== 'string') {
          throw new Error('--optional-contract requires a contract name');
        }
        options.optionalContracts.add(argv[i + 1]);
        i += 1;
        break;
      case '--no-toolchain-check':
        options.enforceToolchain = false;
        break;
      case '--no-git-check':
        options.enforceGit = false;
        break;
      case '--help':
        console.log(usage());
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  return options;
}

function readManifest(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Manifest not found: ${path.relative(process.cwd(), filePath)}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isZeroAddress(value) {
  if (!isNonEmptyString(value)) {
    return true;
  }
  const normalised = value.trim().toLowerCase();
  return normalised === '0x0000000000000000000000000000000000000000';
}

function ensureToolchain(toolchain, errors) {
  if (!toolchain || typeof toolchain !== 'object') {
    errors.push('Manifest missing toolchain metadata.');
    return;
  }
  const required = {
    node: 'Node.js version',
    hardhat: 'Hardhat version',
    solc: 'solc version',
    forge: 'forge version',
  };
  for (const [key, label] of Object.entries(required)) {
    if (!isNonEmptyString(toolchain[key])) {
      errors.push(`Manifest missing ${label.toLowerCase()}.`);
    }
  }
}

function ensureGitInfo(gitInfo, errors) {
  if (!gitInfo || typeof gitInfo !== 'object') {
    errors.push('Manifest missing git metadata.');
    return;
  }
  if (!isNonEmptyString(gitInfo.commit)) {
    errors.push('Manifest git.commit is empty.');
  }
  if (gitInfo.dirty === true) {
    errors.push('Manifest recorded dirty git tree; release must run from a clean commit.');
  }
}

function ensureContracts(manifest, options, errors) {
  if (!manifest.contracts || typeof manifest.contracts !== 'object') {
    errors.push('Manifest has no contracts section.');
    return;
  }
  const names = Object.keys(manifest.contracts);
  if (names.length === 0) {
    errors.push('Manifest contract inventory is empty.');
    return;
  }
  for (const name of names.sort()) {
    const entry = manifest.contracts[name];
    if (!entry || typeof entry !== 'object') {
      errors.push(`Manifest entry for ${name} is invalid.`);
      continue;
    }
    if (!isNonEmptyString(entry.artifact)) {
      errors.push(`Manifest missing artifact path for ${name}.`);
    }
    if (!isNonEmptyString(entry.bytecodeHash)) {
      errors.push(`Manifest missing bytecode hash for ${name}.`);
    }
    if (!Number.isFinite(entry.deployedBytecodeLength) || entry.deployedBytecodeLength <= 0) {
      errors.push(`Manifest missing deployed bytecode length for ${name}.`);
    }
    if (!isNonEmptyString(entry.abiHash)) {
      errors.push(`Manifest missing ABI hash for ${name}.`);
    }

    if (options.requireAddresses && !options.optionalContracts.has(name)) {
      if (!entry.addresses || typeof entry.addresses !== 'object') {
        errors.push(`Manifest missing address records for ${name}.`);
      } else if (!isNonEmptyString(entry.addresses.config) || isZeroAddress(entry.addresses.config)) {
        errors.push(`Manifest config address for ${name} is missing or zero.`);
      }
    }
  }
}

function collectBlockingWarnings(manifest, options) {
  const warnings = Array.isArray(manifest.warnings) ? manifest.warnings : [];
  if (!options.failOnWarnings) {
    return [];
  }
  const blocking = warnings.filter((warning) => !options.allowedWarnings.has(warning));
  if (blocking.length > 0) {
    return [`Manifest emitted warnings:\n- ${blocking.join('\n- ')}`];
  }
  return [];
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const manifest = readManifest(options.manifestPath);
    const errors = [];

    errors.push(...collectBlockingWarnings(manifest, options));

    if (options.enforceToolchain) {
      ensureToolchain(manifest.toolchain, errors);
    }
    if (options.enforceGit) {
      ensureGitInfo(manifest.git, errors);
    }
    ensureContracts(manifest, options, errors);

    if (errors.length > 0) {
      console.error('Manifest validation failed:\n');
      for (const error of errors) {
        console.error(`- ${error}`);
      }
      console.error(`\nSee ${path.relative(process.cwd(), options.manifestPath)} for details.`);
      process.exit(1);
    }

    console.log(`Manifest validation succeeded for ${path.relative(process.cwd(), options.manifestPath)}.`);
  } catch (error) {
    if (error && error.message) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
