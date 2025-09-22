#!/usr/bin/env node
'use strict';

const path = require('path');
const { ethers } = require('ethers');
const namehash = require('eth-ens-namehash');
require('dotenv').config();

const metrics = require('./metrics');
const { loadConfig, ensLabelFrom } = require('./v2-agent-gateway');

const ZERO_HASH = ethers.ZeroHash;
const CONFIG_PATH = process.env.GATEWAY_CONFIG
  ? path.resolve(process.cwd(), process.env.GATEWAY_CONFIG)
  : path.resolve(__dirname, 'gateway.config.json');

function parseProvider(cfg) {
  const fallback = cfg?.rpcUrl || process.env.RPC_URL || '';
  const networkKey = (cfg?.network || '').toLowerCase();
  if (networkKey === 'mainnet' && process.env.RPC_MAINNET) {
    return new ethers.JsonRpcProvider(process.env.RPC_MAINNET);
  }
  if (networkKey === 'sepolia' && process.env.RPC_SEPOLIA) {
    return new ethers.JsonRpcProvider(process.env.RPC_SEPOLIA);
  }
  if (!fallback) {
    throw new Error('RPC URL missing (set rpcUrl in config or RPC_URL env).');
  }
  return new ethers.JsonRpcProvider(fallback);
}

function loadWallet(provider) {
  if (process.env.PRIVATE_KEY) {
    return new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  }
  if (process.env.MNEMONIC) {
    return ethers.HDNodeWallet.fromPhrase(process.env.MNEMONIC).connect(
      provider
    );
  }
  throw new Error('Provide PRIVATE_KEY or MNEMONIC for validator runtime.');
}

function ensureValidatorEns(ensName, cfg) {
  if (!ensName) {
    throw new Error('Set VALIDATOR_ENS to your validator ENS name.');
  }
  const normalised = namehash.normalize(ensName);
  const allowed = new Set();
  if (cfg?.ens?.clubRoot) {
    allowed.add(namehash.normalize(cfg.ens.clubRoot));
  }
  if (cfg?.ens?.alphaClubRoot && cfg?.ens?.acceptAlphaRoot) {
    allowed.add(namehash.normalize(cfg.ens.alphaClubRoot));
  }
  if (allowed.size === 0) {
    return;
  }
  for (const root of allowed) {
    if (normalised.endsWith(`.${root}`) || normalised === root) {
      return;
    }
  }
  throw new Error(
    `Validator ENS ${normalised} is not inside allowed club roots (${Array.from(
      allowed
    ).join(', ')})`
  );
}

function normalizeProofEntry(entry) {
  if (entry === null || typeof entry === 'undefined') {
    return null;
  }
  const text = String(entry).trim();
  if (!text || text === '0x' || text === '[]') {
    return null;
  }
  try {
    const value = BigInt(text);
    return ethers.hexlify(ethers.zeroPadValue(ethers.toBeArray(value), 32));
  } catch (err) {
    try {
      const bytes = ethers.getBytes(text);
      return ethers.hexlify(ethers.zeroPadValue(bytes, 32));
    } catch {
      return null;
    }
  }
}

function parseProof(raw) {
  if (!raw) return [];
  const normalised = [];
  const push = (value) => {
    const normalisedValue = normalizeProofEntry(value);
    if (normalisedValue) {
      normalised.push(normalisedValue);
    }
  };
  if (Array.isArray(raw)) {
    raw.forEach(push);
    return normalised;
  }
  const text = String(raw).trim();
  if (!text || text === '0x' || text === '[]') {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      parsed.forEach(push);
      return normalised;
    }
    push(parsed);
    return normalised;
  } catch (err) {
    const stripped = text.replace(/^[\[{\s]+|[\]}\s]+$/g, '');
    if (!stripped) {
      return [];
    }
    stripped.split(/[\s,]+/).forEach(push);
    return normalised;
  }
}

function commitHash(approve, saltHex) {
  const salt = ethers.getBytes(saltHex);
  if (salt.length !== 32) {
    throw new Error('Salt must be 32 bytes.');
  }
  return ethers.keccak256(
    ethers.solidityPacked(['bool', 'bytes32'], [approve, salt])
  );
}

function schedule(fn, delayMs) {
  return setTimeout(fn, Math.max(0, delayMs));
}

async function main() {
  const cfg = loadConfig(CONFIG_PATH);
  const provider = parseProvider(cfg);
  const wallet = loadWallet(provider);

  const validationAddress = cfg.validationModule || cfg.validationModuleAddress;
  if (!validationAddress || !ethers.isAddress(validationAddress)) {
    throw new Error(
      'Configure validationModule address in gateway.config.json'
    );
  }

  const validatorEns = process.env.VALIDATOR_ENS || process.env.ENS_LABEL || '';
  ensureValidatorEns(validatorEns, cfg);
  const validatorLabel = ensLabelFrom(validatorEns);

  const commitProof = parseProof(
    process.env.COMMIT_PROOF ||
      process.env.VALIDATOR_PROOF ||
      process.env.MERKLE_PROOF
  );
  const revealProof = parseProof(
    process.env.REVEAL_PROOF ||
      process.env.VALIDATOR_REVEAL_PROOF ||
      process.env.VALIDATION_PROOF
  );
  const burnHash = (process.env.BURN_TX_HASH || '').trim();
  const defaultApprove =
    typeof process.env.VALIDATOR_DECISION === 'string'
      ? ['1', 'true', 'yes', 'approve'].includes(
          process.env.VALIDATOR_DECISION.trim().toLowerCase()
        )
      : true;

  const validationAbi = [
    'event ValidatorsSelected(uint256 indexed jobId,address[] validators)',
    'event ValidationCommitted(uint256 indexed jobId,address indexed validator,bytes32 commitHash,string subdomain)',
    'event ValidationResult(uint256 indexed jobId,bool success)',
    'function commitValidation(uint256 jobId,bytes32 commitHash,string subdomain,bytes32[] proof)',
    'function revealValidation(uint256 jobId,bool approve,bytes32 burnTxHash,bytes32 salt,string subdomain,bytes32[] proof)',
    'function revealDeadline(uint256 jobId) view returns (uint256)',
  ];

  const moduleReader = new ethers.Contract(
    validationAddress,
    validationAbi,
    provider
  );
  const moduleWriter = moduleReader.connect(wallet);

  const network = await provider.getNetwork();
  console.log(
    `[validator] network=${network.name} chainId=${network.chainId} wallet=${wallet.address} ens=${validatorEns}`
  );

  const commits = new Map();

  function clearJob(jobId) {
    const key = jobId.toString();
    const state = commits.get(key);
    if (state && state.timer) {
      clearTimeout(state.timer);
    }
    commits.delete(key);
  }

  moduleReader.on('ValidatorsSelected', async (jobId, validators) => {
    const started = Date.now();
    try {
      const normalized = Array.isArray(validators)
        ? validators.map((addr) => addr.toLowerCase())
        : [];
      if (!normalized.includes(wallet.address.toLowerCase())) {
        return;
      }
      const approve = defaultApprove;
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const hash = commitHash(approve, salt);
      console.log(
        `[validator] committing job=${jobId.toString()} hash=${hash}`
      );
      const tx = await moduleWriter.commitValidation(
        jobId,
        hash,
        validatorLabel,
        commitProof
      );
      await tx.wait(2);
      metrics.logEnergy('commit', {
        jobId: jobId.toString(),
        millis: Date.now() - started,
      });

      let revealDelayMs = 10000;
      try {
        const deadline = await moduleReader.revealDeadline(jobId);
        const deadlineMs = Number(deadline) * 1000;
        const buffer = 5000;
        const wait = deadlineMs - Date.now() - buffer;
        if (Number.isFinite(wait)) {
          revealDelayMs = Math.max(1000, wait);
        }
      } catch (deadlineErr) {
        console.warn(
          '[validator] revealDeadline lookup failed:',
          deadlineErr.message || deadlineErr
        );
      }

      const timer = schedule(async () => {
        const revealStarted = Date.now();
        try {
          const burn = burnHash
            ? ethers.hexlify(ethers.zeroPadValue(ethers.getBytes(burnHash), 32))
            : ZERO_HASH;
          const txReveal = await moduleWriter.revealValidation(
            jobId,
            approve,
            burn,
            salt,
            validatorLabel,
            revealProof
          );
          await txReveal.wait(2);
          metrics.logEnergy('reveal', {
            jobId: jobId.toString(),
            millis: Date.now() - revealStarted,
          });
          clearJob(jobId);
        } catch (revealErr) {
          const message =
            revealErr?.error?.message ||
            revealErr?.message ||
            String(revealErr);
          console.error('[validator] reveal error:', message);
          metrics.logQuarantine('reveal', message, { jobId: jobId.toString() });
        }
      }, revealDelayMs);

      commits.set(jobId.toString(), { approve, salt, timer });
    } catch (err) {
      const message = err?.error?.message || err?.message || String(err);
      console.error('[validator] commit error:', message);
      metrics.logQuarantine('commit', message, { jobId: jobId.toString() });
    }
  });

  moduleReader.on('ValidationResult', (jobId, success) => {
    console.log(
      `[validator] validation result job=${jobId.toString()} success=${success}`
    );
    clearJob(jobId);
  });

  metrics.logTelemetry('validator.started', {
    chainId: Number(network.chainId),
    wallet: wallet.address,
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[validator] fatal:', err.message || err);
    metrics.logQuarantine('fatal', err.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  commitHash,
  main,
  parseProof,
};
