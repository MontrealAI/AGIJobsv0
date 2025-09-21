#!/usr/bin/env node
/**
 * Validator helper for AGI Jobs v2 commit/reveal flow.
 *
 * Usage:
 *   node examples/agentic/v2-validator.js commit <jobId> <approve> [salt] [subdomain]
 *   node examples/agentic/v2-validator.js reveal <jobId> [approve] [salt] [burnTxHash] [subdomain]
 *
 * Environment variables:
 *   RPC_URL                      JSON-RPC endpoint (defaults to http://localhost:8545)
 *   PRIVATE_KEY                  Validator private key (required)
 *   VALIDATION_MODULE_ADDRESS    ValidationModule address (or VALIDATION_MODULE)
 *   JOB_REGISTRY_ADDRESS         JobRegistry address (or JOB_REGISTRY)
 *   VALIDATOR_SUBDOMAIN          ENS/identity label (falls back to ENS_LABEL)
 *   MERKLE_PROOF                 JSON array or comma-separated proof for commit/reveal
 *   COMMIT_PROOF                 Optional override for commit proof
 *   REVEAL_PROOF                 Optional override for reveal proof
 *   BURN_TX_HASH                 Optional burn receipt hash override (0x...)
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

function usage() {
  console.error(
    `Usage: node v2-validator.js <commit|reveal> <jobId> [options]\n\n` +
      'Examples:\n' +
      '  node v2-validator.js commit 42 true\n' +
      '  node v2-validator.js reveal 42\n'
  );
}

const ACTION = (process.argv[2] || '').toLowerCase();
if (!['commit', 'reveal'].includes(ACTION)) {
  usage();
  process.exit(1);
}

const jobIdArg = process.argv[3];
if (!jobIdArg) {
  console.error('Missing jobId argument.');
  usage();
  process.exit(1);
}

let jobId;
try {
  jobId = ethers.getBigInt(jobIdArg);
} catch (err) {
  console.error('Invalid job identifier:', err.message || err);
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const VALIDATION_ADDRESS =
  process.env.VALIDATION_MODULE_ADDRESS || process.env.VALIDATION_MODULE || '';
const JOB_REGISTRY_ADDRESS =
  process.env.JOB_REGISTRY_ADDRESS || process.env.JOB_REGISTRY || '';

if (!PRIVATE_KEY) {
  console.error('PRIVATE_KEY is required.');
  process.exit(1);
}
if (!VALIDATION_ADDRESS) {
  console.error('VALIDATION_MODULE_ADDRESS (or VALIDATION_MODULE) is required.');
  process.exit(1);
}
if (!ethers.isAddress(VALIDATION_ADDRESS)) {
  console.error('Validation module address must be a valid Ethereum address.');
  process.exit(1);
}
if (!JOB_REGISTRY_ADDRESS) {
  console.error('JOB_REGISTRY_ADDRESS (or JOB_REGISTRY) is required.');
  process.exit(1);
}
if (!ethers.isAddress(JOB_REGISTRY_ADDRESS)) {
  console.error('Job registry address must be a valid Ethereum address.');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const DEFAULT_SUBDOMAIN =
  (process.env.VALIDATOR_SUBDOMAIN || process.env.ENS_LABEL || '').trim();

const validationAbi = [
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function commitValidation(uint256,bytes32,string,bytes32[])',
  'function revealValidation(uint256,bool,bytes32,bytes32,string,bytes32[])',
];

const registryAbi = [
  'event BurnReceiptSubmitted(uint256 indexed jobId, bytes32 burnTxHash, uint256 amount, uint256 blockNumber)',
  'function getSpecHash(uint256 jobId) view returns (bytes32)',
  'function burnEvidenceStatus(uint256 jobId) view returns (bool burnRequired, bool burnSatisfied)',
  'function hasBurnReceipt(uint256 jobId, bytes32 burnTxHash) view returns (bool)',
];

const validation = new ethers.Contract(VALIDATION_ADDRESS, validationAbi, wallet);
const registry = new ethers.Contract(JOB_REGISTRY_ADDRESS, registryAbi, provider);

const STORAGE_ROOT = path.resolve(__dirname, '../../storage/validation');

function ensureStorage() {
  if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true, mode: 0o700 });
  }
}

function storagePath(job, address) {
  return path.join(STORAGE_ROOT, `${job.toString()}-${address.toLowerCase()}.json`);
}

function loadRecord(job, address) {
  try {
    const raw = fs.readFileSync(storagePath(job, address), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn('Failed to read validation record:', err.message || err);
    }
    return {};
  }
}

function saveRecord(job, address, update) {
  ensureStorage();
  const existing = loadRecord(job, address);
  const record = { ...existing, ...update };
  const file = storagePath(job, address);
  fs.writeFileSync(file, JSON.stringify(record, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch (err) {
    console.warn('chmod failed for validation record:', err);
  }
  return record;
}

function isBytes32(value) {
  return typeof value === 'string' && /^0x?[0-9a-fA-F]{64}$/.test(value.trim());
}

function normaliseBytes32(value) {
  if (!value) {
    throw new Error('Expected 32-byte hex value.');
  }
  const hex = value.startsWith('0x') ? value : `0x${value}`;
  const bytes = ethers.getBytes(hex);
  if (bytes.length !== 32) {
    throw new Error('Value must be 32 bytes.');
  }
  return ethers.hexlify(bytes);
}

function parseApprove(value) {
  if (typeof value === 'undefined') return undefined;
  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(text)) return true;
  if (['false', '0', 'no', 'n'].includes(text)) return false;
  throw new Error(`Unable to parse approve flag from "${value}"`);
}

function parseProof(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '[]' || trimmed === '0x') return [];
    try {
      const parsed = JSON.parse(trimmed);
      return parseProof(parsed);
    } catch (err) {
      const parts = trimmed.split(/[,\s]+/).filter(Boolean);
      if (parts.length === 0) return [];
      return parts.map((part) => normaliseBytes32(part));
    }
  }
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (entry === null || typeof entry === 'undefined') return null;
        const value = String(entry).trim();
        if (!value || value === '0x') return null;
        return normaliseBytes32(value);
      })
      .filter((value) => value !== null);
  }
  return [normaliseBytes32(String(raw))];
}

const commitProof = parseProof(
  process.env.COMMIT_PROOF || process.env.MERKLE_PROOF || process.env.VALIDATOR_PROOF
);
const revealProof = (function () {
  const override =
    process.env.REVEAL_PROOF || process.env.VALIDATOR_REVEAL_PROOF || process.env.VALIDATION_PROOF;
  return override ? parseProof(override) : commitProof;
})();

async function resolveBurnTxHash(job, override) {
  if (override && override !== '0x') {
    return normaliseBytes32(override);
  }
  if (process.env.BURN_TX_HASH && process.env.BURN_TX_HASH !== '0x') {
    return normaliseBytes32(process.env.BURN_TX_HASH);
  }
  const filter = registry.filters.BurnReceiptSubmitted(job);
  const events = await registry.queryFilter(filter, 0, 'latest');
  if (events.length === 0) {
    return ethers.ZeroHash;
  }
  const last = events[events.length - 1];
  const hash = last.args?.burnTxHash || ethers.ZeroHash;
  try {
    return normaliseBytes32(hash);
  } catch (err) {
    console.warn('Unexpected burn receipt hash from registry:', hash, err);
    return ethers.ZeroHash;
  }
}

async function commit(job, approveFlag, saltArg, subdomainArg) {
  if (typeof approveFlag !== 'boolean') {
    throw new Error('Approve flag required for commit action.');
  }
  const nonce = await validation.jobNonce(job);
  const specHash = await registry.getSpecHash(job);
  const burnTxHash = await resolveBurnTxHash(job);
  const salt = saltArg ? normaliseBytes32(saltArg) : ethers.hexlify(ethers.randomBytes(32));
  const subdomain = (subdomainArg || DEFAULT_SUBDOMAIN || '').trim();

  const commitHash = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
    [job, nonce, approveFlag, burnTxHash, salt, specHash]
  );

  const tx = await validation.commitValidation(job, commitHash, subdomain, commitProof);
  await tx.wait();

  const record = saveRecord(job, wallet.address, {
    jobId: job.toString(),
    validator: wallet.address,
    approve: approveFlag,
    salt,
    burnTxHash,
    subdomain,
    commitHash,
    commitTx: tx.hash,
    committedAt: new Date().toISOString(),
  });
  console.log('Committed validation', tx.hash);
  console.log('Stored record at', storagePath(job, wallet.address));
  console.log('Record:', record);
}

async function reveal(job, approveOverride, saltArg, burnArg, subdomainArg) {
  const record = loadRecord(job, wallet.address);
  const approve =
    typeof approveOverride === 'boolean'
      ? approveOverride
      : typeof record.approve === 'boolean'
      ? record.approve
      : undefined;
  if (typeof approve !== 'boolean') {
    throw new Error('Approve flag missing. Provide it or commit first.');
  }
  const saltSource = saltArg || record.salt;
  if (!saltSource) {
    throw new Error('Salt missing. Provide it or ensure commit record exists.');
  }
  const burnSource = burnArg || record.burnTxHash;
  const salt = normaliseBytes32(saltSource);
  const burnTxHash = burnSource ? normaliseBytes32(burnSource) : await resolveBurnTxHash(job);
  const subdomain = (subdomainArg || record.subdomain || DEFAULT_SUBDOMAIN || '').trim();

  const tx = await validation.revealValidation(
    job,
    approve,
    burnTxHash,
    salt,
    subdomain,
    revealProof
  );
  await tx.wait();

  const updated = saveRecord(job, wallet.address, {
    approve,
    salt,
    burnTxHash,
    subdomain,
    revealTx: tx.hash,
    revealedAt: new Date().toISOString(),
  });
  console.log('Revealed validation', tx.hash);
  console.log('Updated record:', updated);
}

async function main() {
  const approveArg = process.argv[4];
  try {
    if (ACTION === 'commit') {
      const approve = parseApprove(approveArg);
      if (approve === undefined) {
        throw new Error('Approve flag required for commit (true/false).');
      }
      const remaining = process.argv.slice(5);
      let saltArg;
      let subdomainArg;
      if (remaining.length > 0 && isBytes32(remaining[0])) {
        saltArg = remaining.shift();
      }
      if (remaining.length > 0) {
        subdomainArg = remaining.shift();
      }
      await commit(jobId, approve, saltArg, subdomainArg);
    } else {
      const remaining = process.argv.slice(4);
      let approveOverride;
      if (remaining.length > 0) {
        const candidate = String(remaining[0]).trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'false', '0', 'no', 'n'].includes(candidate)) {
          approveOverride = parseApprove(remaining.shift());
        }
      }
      let saltArg;
      let burnArg;
      if (remaining.length > 0 && isBytes32(remaining[0])) {
        saltArg = remaining.shift();
      }
      if (remaining.length > 0 && isBytes32(remaining[0])) {
        burnArg = remaining.shift();
      }
      const subdomainArg = remaining.length > 0 ? remaining.shift() : undefined;
      await reveal(jobId, approveOverride, saltArg, burnArg, subdomainArg);
    }
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
