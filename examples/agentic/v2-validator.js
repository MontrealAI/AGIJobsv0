#!/usr/bin/env node
'use strict';

const path = require('path');
const os = require('os');
const { ethers } = require('ethers');
const namehash = require('eth-ens-namehash');
require('dotenv').config();

const metrics = require('./metrics');
const { loadConfig, ensLabelFrom } = require('./v2-agent-gateway');

const {
  RevealJournal,
  ValidatorRecoveryError,
  commitHash,
  createValidatorRuntime,
  safeErrorCode,
} = require('./validator-recovery');

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
    throw new ValidatorRecoveryError('VALIDATOR_RPC_URL_REQUIRED');
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
  throw new ValidatorRecoveryError('VALIDATOR_CREDENTIALS_REQUIRED');
}

function ensureValidatorEns(ensName, cfg) {
  if (!ensName) {
    throw new ValidatorRecoveryError('VALIDATOR_ENS_REQUIRED');
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
  throw new ValidatorRecoveryError('VALIDATOR_ENS_ROOT_MISMATCH');
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

function parseDecision(value) {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (['1', 'true', 'yes', 'approve'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'reject'].includes(normalized)) return false;
  throw new ValidatorRecoveryError(
    'VALIDATOR_EXPLICIT_REHEARSAL_DECISION_REQUIRED'
  );
}

async function main() {
  const defaultApprove = parseDecision(process.env.VALIDATOR_DECISION);
  let cfg;
  try {
    cfg = loadConfig(CONFIG_PATH);
  } catch {
    throw new ValidatorRecoveryError('VALIDATOR_GATEWAY_CONFIG_INVALID');
  }
  const provider = parseProvider(cfg);
  const wallet = loadWallet(provider);

  const validationAddress = cfg.validationModule || cfg.validationModuleAddress;
  if (!validationAddress || !ethers.isAddress(validationAddress)) {
    throw new ValidatorRecoveryError('VALIDATOR_MODULE_ADDRESS_REQUIRED');
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
  const validationAbi = [
    'event ValidatorsSelected(uint256 indexed jobId,address[] validators)',
    'event ValidationCommitted(uint256 indexed jobId,address indexed validator,bytes32 commitHash,string subdomain)',
    'event ValidationResult(uint256 indexed jobId,bool success)',
    'function commitValidation(uint256 jobId,bytes32 commitHash,string subdomain,bytes32[] proof)',
    'function revealValidation(uint256 jobId,bool approve,bytes32 burnTxHash,bytes32 salt,string subdomain,bytes32[] proof)',
    'function jobNonce(uint256 jobId) view returns (uint256)',
    'function DOMAIN_SEPARATOR() view returns (bytes32)',
    'function commitments(uint256 jobId,address validator,uint256 nonce) view returns (bytes32)',
    'function revealed(uint256 jobId,address validator) view returns (bool)',
    'function jobRegistry() view returns (address)',
    'function rounds(uint256 jobId) view returns (uint256 commitDeadline,uint256 revealDeadline,uint256 approvals,uint256 rejections,uint256 revealedCount,bool tallied,uint256 committeeSize,uint64 earlyFinalizeEligibleAt,bool earlyFinalized)',
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

  const registryAddress = await moduleReader.jobRegistry();
  if (
    !ethers.isAddress(registryAddress) ||
    registryAddress === ethers.ZeroAddress
  ) {
    throw new ValidatorRecoveryError('VALIDATOR_REGISTRY_ADDRESS_INVALID');
  }
  const registry = new ethers.Contract(
    registryAddress,
    ['function getSpecHash(uint256 jobId) view returns (bytes32)'],
    provider
  );
  const stateDirectory =
    process.env.VALIDATOR_STATE_DIR ||
    path.join(os.homedir(), '.agi-jobs', 'validator-reveals');
  const journal = new RevealJournal(stateDirectory, {
    chainId: network.chainId,
    validationModule: validationAddress,
    validator: wallet.address,
  });
  const runtime = createValidatorRuntime({
    journal,
    reader: moduleReader,
    writer: moduleWriter,
    registry,
    provider,
    validatorLabel,
    approve: defaultApprove,
    burnTxHash: burnHash
      ? ethers.hexlify(ethers.zeroPadValue(ethers.getBytes(burnHash), 32))
      : ZERO_HASH,
    commitProof,
    revealProof,
    report: (phase, jobId) => {
      console.log(`[validator] ${phase} confirmed job=${jobId}`);
      metrics.logEnergy(phase, { jobId });
    },
  });
  const reportError = (phase, err, jobId) => {
    // RPC exceptions may embed signed transactions and reveal calldata.
    const code = safeErrorCode(err);
    console.error(`[validator] ${phase}: ${code}`);
    metrics.logQuarantine(
      phase,
      code,
      jobId === undefined ? {} : { jobId: String(jobId) }
    );
  };
  const reportedStates = new Map();
  let recovering = false;
  async function recover() {
    if (recovering) return;
    recovering = true;
    try {
      for (const { jobId, status } of await runtime.recover()) {
        if (reportedStates.get(jobId) === status) continue;
        reportedStates.set(jobId, status);
        if (status.endsWith('-uncertain') || status.startsWith('VALIDATOR_')) {
          console.warn(
            `[validator] job=${jobId} status=${status}; retain the journal and reconcile on-chain state before any manual retry.`
          );
          metrics.logQuarantine('recovery', status, { jobId });
        }
      }
    } finally {
      recovering = false;
    }
  }
  const interval = Number(process.env.VALIDATOR_POLL_MS || 5000);
  if (!Number.isSafeInteger(interval) || interval < 1000 || interval > 60000) {
    throw new ValidatorRecoveryError('VALIDATOR_POLL_INTERVAL_INVALID');
  }
  // Validate all retained records before enabling event-driven broadcasts.
  journal.records();
  moduleReader.on('ValidatorsSelected', (jobId, validators) => {
    runtime
      .selected(jobId, validators)
      .catch((err) => reportError('commit', err, jobId));
  });
  await recover();
  setInterval(
    () => recover().catch((err) => reportError('recovery', err)),
    interval
  );

  metrics.logTelemetry('validator.started', {
    chainId: Number(network.chainId),
    wallet: wallet.address,
  });
}

if (require.main === module) {
  main().catch((err) => {
    const code = safeErrorCode(err);
    console.error('[validator] fatal:', code);
    metrics.logQuarantine('fatal', code);
    process.exit(1);
  });
}

module.exports = {
  commitHash,
  main,
  parseProof,
  parseDecision,
};
