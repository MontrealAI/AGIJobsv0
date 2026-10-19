#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function validateVerificationInventory(manifest, config, network) {
  if (manifest.network?.name !== network || config.network !== network) {
    throw new Error('Verification network must match both the manifest and configuration');
  }
  const contracts = Array.isArray(config.contracts) ? config.contracts : [];
  const entries = Object.keys(manifest.contracts || {});
  if (!contracts.length || !entries.length) throw new Error('Verification inventory must not be empty');
  const covered = new Set();
  for (const contract of contracts) {
    const key = contract.manifestKey || contract.name;
    if (!entries.includes(key)) throw new Error(`Verification contract absent from manifest: ${key}`);
    if (covered.has(key)) throw new Error(`Duplicate verification contract: ${key}`);
    if (contract.skip) throw new Error(`Release verification cannot skip ${key}`);
    const address = resolveAddress(contract, manifest);
    if (!/^0x[0-9a-fA-F]{40}$/.test(address || '') || isZeroAddress(address)) {
      throw new Error(`Verification address missing, malformed, or zero: ${key}`);
    }
    covered.add(key);
  }
  for (const key of entries) {
    if (!covered.has(key)) throw new Error(`Contract omitted from verification: ${key}`);
  }
}

function parseArgs(argv) {
  const args = {
    network: 'mainnet',
    manifest: path.resolve(process.cwd(), 'reports/release/manifest.json'),
    config: null,
    dryRun: false,
    planOut: path.resolve(process.cwd(), 'reports/release/verification-summary.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if ((current === '--network' || current === '-n') && typeof argv[i + 1] === 'string') {
      args.network = argv[i + 1];
      i += 1;
    } else if ((current === '--manifest' || current === '-m') && typeof argv[i + 1] === 'string') {
      args.manifest = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if ((current === '--config' || current === '-c') && typeof argv[i + 1] === 'string') {
      args.config = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (current === '--dry-run') {
      args.dryRun = true;
    } else if (current === '--plan-out' && typeof argv[i + 1] === 'string') {
      args.planOut = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    }
  }

  if (!args.config) {
    args.config = path.resolve(process.cwd(), 'deployment-config/verification', `${args.network}.json`);
  }

  return args;
}

function loadJson(filePath, { optional = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (optional) {
      return null;
    }
    throw new Error(`Required file not found: ${path.relative(process.cwd(), filePath)}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normaliseHex(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.toLowerCase().startsWith('0x') ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}

function isZeroAddress(value) {
  const normalised = normaliseHex(value);
  if (!normalised || normalised === '0x') {
    return true;
  }
  const body = normalised.slice(2);
  return body.length === 0 || /^0+$/.test(body);
}

function getByPath(root, pathExpression) {
  if (!root || typeof pathExpression !== 'string') {
    return undefined;
  }
  return pathExpression.split('.').reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), root);
}

function resolveAddress(contractConfig, manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return null;
  }

  if (typeof contractConfig.address === 'string') {
    return contractConfig.address;
  }

  if (Array.isArray(contractConfig.addressCandidates)) {
    for (const candidate of contractConfig.addressCandidates) {
      const resolved = resolveAddress({ addressSource: candidate }, manifest);
      if (resolved) {
        return resolved;
      }
    }
  }

  if (typeof contractConfig.addressSource === 'string') {
    const value = getByPath(manifest, contractConfig.addressSource);
    if (typeof value === 'string') {
      return value;
    }
  }

  const manifestKey = contractConfig.manifestKey || contractConfig.name;
  const contractEntry = manifest.contracts && manifest.contracts[manifestKey];
  if (!contractEntry) {
    return null;
  }

  if (typeof contractEntry.address === 'string') {
    return contractEntry.address;
  }

  if (!contractEntry.addresses || typeof contractEntry.addresses !== 'object') {
    return null;
  }

  const preferredFields = Array.isArray(contractConfig.addressFields)
    ? contractConfig.addressFields
    : ['config', 'summary'];

  for (const field of preferredFields) {
    if (Object.prototype.hasOwnProperty.call(contractEntry.addresses, field)) {
      const value = contractEntry.addresses[field];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

function resolveApiKey(explorerConfig) {
  if (!explorerConfig) {
    return { key: null, source: null };
  }

  const envCandidates = Array.isArray(explorerConfig.apiKeyEnv)
    ? explorerConfig.apiKeyEnv
    : explorerConfig.apiKeyEnv
      ? [explorerConfig.apiKeyEnv]
      : [];

  for (const candidate of envCandidates) {
    if (process.env[candidate] && process.env[candidate].trim().length > 0) {
      return { key: process.env[candidate].trim(), source: candidate };
    }
  }

  if (typeof process.env.ETHERSCAN_API_KEY === 'string' && process.env.ETHERSCAN_API_KEY.trim().length > 0) {
    return { key: process.env.ETHERSCAN_API_KEY.trim(), source: 'ETHERSCAN_API_KEY' };
  }

  return { key: null, source: null };
}

function writeConstructorArgsTempFile(argsArray, _label) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agijobs-verify-args-'));
  const tempFile = path.join(directory, 'constructor-args.cjs');
  try {
    fs.writeFileSync(tempFile, `module.exports = ${JSON.stringify(argsArray, null, 2)};\n`, { flag: 'wx', mode: 0o600 });
    return tempFile;
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function runHardhatVerify(
  { network, address, fullyQualified, libraries, constructorArgsFile, dryRun },
  spawn = spawnSync
) {
  const args = ['hardhat', 'verify', '--network', network, address];

  if (fullyQualified) {
    args.push('--contract', fullyQualified);
  }

  let libraryDirectory;
  if (libraries && Object.keys(libraries).length > 0) {
    libraryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'agijobs-verify-libraries-')
    );
    const libraryFile = path.join(libraryDirectory, 'libraries.cjs');
    fs.writeFileSync(
      libraryFile,
      `module.exports = ${JSON.stringify(libraries)};\n`,
      { flag: 'wx' }
    );
    args.push('--libraries', libraryFile);
  }

  if (constructorArgsFile) {
    args.push('--constructor-args', constructorArgsFile);
  }

  try {
    if (dryRun) {
      console.log(`[dry-run] npx ${args.join(' ')}`);
      return { status: 0, alreadyVerified: false };
    }
    const result = spawn('npx', args, {
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    // A killed/missing child has null status. Never coerce that to success.
    const status =
      result.error || result.signal || !Number.isInteger(result.status)
        ? 1
        : result.status;
    const combined = `${result.stdout || ''}\n${
      result.stderr || ''
    }`.toLowerCase();
    return {
      status,
      alreadyVerified: status === 0 && combined.includes('already verified'),
    };
  } finally {
    if (libraryDirectory)
      fs.rmSync(libraryDirectory, { recursive: true, force: true });
  }
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const manifest = loadJson(options.manifest);
    const config = loadJson(options.config);
    validateVerificationInventory(manifest, config, options.network);

    const explorer = config.explorer || {};
    const apiKey = resolveApiKey(explorer);

    const requiresApiKey = explorer.requireApiKey !== false && explorer.type !== 'blockscout';
    if (requiresApiKey) {
      if (!apiKey.key) {
        if (options.dryRun) {
          console.warn(
            `Dry-run: explorer API key missing. Populate ${
              Array.isArray(explorer.apiKeyEnv) && explorer.apiKeyEnv.length > 0
                ? explorer.apiKeyEnv.join(', ')
                : 'ETHERSCAN_API_KEY'
            } before executing a real release.`
          );
        } else {
          throw new Error(
            `Missing explorer API key. Provide one of: ${
              Array.isArray(explorer.apiKeyEnv) && explorer.apiKeyEnv.length > 0
                ? explorer.apiKeyEnv.join(', ')
                : 'ETHERSCAN_API_KEY'
            }`
          );
        }
      } else {
        process.env.ETHERSCAN_API_KEY = apiKey.key;
      }
    }

    const summary = {
      network: options.network,
      explorer: {
        name: explorer.name || null,
        apiUrl: explorer.apiUrl || null,
        apiKeySource: apiKey.source,
      },
      contracts: [],
      dryRun: options.dryRun,
      generatedAt: new Date().toISOString(),
    };

    const contracts = Array.isArray(config.contracts) ? config.contracts : [];
    if (contracts.length === 0) {
      console.warn('No contracts specified for verification.');
    }

    for (const contract of contracts) {
      if (contract.skip) {
        summary.contracts.push({
          name: contract.name,
          status: 'skipped',
          reason: 'Marked as skip in configuration.',
        });
        continue;
      }

      const address = resolveAddress(contract, manifest);
      if (!address || isZeroAddress(address)) {
        summary.contracts.push({
          name: contract.name,
          status: 'skipped',
          reason: 'Address missing or zero in manifest/configuration.',
        });
        console.warn(`Skipping ${contract.name}: address unresolved.`);
        continue;
      }

      let constructorArgsFile = null;
      let tempFile = null;
      if (Array.isArray(contract.constructorArgs)) {
        tempFile = writeConstructorArgsTempFile(contract.constructorArgs, contract.name.replace(/\W+/g, '').toLowerCase());
        constructorArgsFile = tempFile;
      } else if (typeof contract.constructorArgsFile === 'string') {
        constructorArgsFile = path.resolve(process.cwd(), contract.constructorArgsFile);
        if (!fs.existsSync(constructorArgsFile)) {
          throw new Error(`Constructor args file missing for ${contract.name}: ${contract.constructorArgsFile}`);
        }
      }

      let verificationResult;
      try {
        verificationResult = runHardhatVerify({
        network: options.network,
        address,
        fullyQualified: contract.fullyQualified,
        libraries: contract.libraries,
        constructorArgsFile,
        dryRun: options.dryRun,
      });

      } finally {
        if (tempFile) fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
      }
      const { status, alreadyVerified } = verificationResult;

      if (status !== 0) {
        summary.contracts.push({
          name: contract.name,
          status: 'failed',
          address,
          message: 'Verification command returned non-zero exit code.',
        });
        throw new Error(`Verification failed for ${contract.name} at ${address}`);
      }

      summary.contracts.push({
        name: contract.name,
        status: options.dryRun ? 'planned' : alreadyVerified ? 'already_verified' : 'verified',
        address,
        fullyQualified: contract.fullyQualified || null,
      });
    }

    ensureDirectory(options.planOut);
    fs.writeFileSync(options.planOut, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`Verification summary written to ${path.relative(process.cwd(), options.planOut)}`);
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { validateVerificationInventory, runHardhatVerify, writeConstructorArgsTempFile };
