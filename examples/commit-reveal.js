/**
 * Commit and reveal validation votes while persisting the salt locally.
 *
 * Usage:
 *   node examples/commit-reveal.js commit <jobId> <approve> [salt] [subdomain]
 *   node examples/commit-reveal.js reveal <jobId> [approve] [salt] [subdomain]
 *
 * Environment:
 *   RPC_URL, PRIVATE_KEY, VALIDATION_MODULE
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

if (!process.env.VALIDATION_MODULE) {
  throw new Error('VALIDATION_MODULE env var is required');
}
if (!process.env.PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY env var is required');
}

const provider = new ethers.JsonRpcProvider(
  process.env.RPC_URL || 'http://localhost:8545'
);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const validationAbi = [
  'function jobNonce(uint256) view returns (uint256)',
  'function commitValidation(uint256,bytes32,string,bytes32[])',
  'function revealValidation(uint256,bool,bytes32,string,bytes32[])',
];

const validation = new ethers.Contract(
  process.env.VALIDATION_MODULE,
  validationAbi,
  wallet
);

const STORAGE_ROOT = path.resolve(__dirname, '../storage/validation');

function ensureStorage() {
  if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true, mode: 0o700 });
  }
}

function storagePath(jobId, address) {
  const suffix = address.toLowerCase();
  return path.join(STORAGE_ROOT, `${jobId}-${suffix}.json`);
}

function loadRecord(jobId, address) {
  try {
    const raw = fs.readFileSync(storagePath(jobId, address), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn('Failed to read commit record', err.message || err);
    }
    return {};
  }
}

function saveRecord(jobId, address, update) {
  ensureStorage();
  const file = storagePath(jobId, address);
  const existing = loadRecord(jobId, address);
  const record = { ...existing, ...update };
  fs.writeFileSync(file, JSON.stringify(record, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch (err) {
    console.warn('chmod failed for commit record', err);
  }
  return record;
}

function isHexSalt(value) {
  return typeof value === 'string' && /^0x?[0-9a-fA-F]{64}$/.test(value.trim());
}

function normaliseSalt(value) {
  const candidate = value.startsWith('0x') ? value : `0x${value}`;
  const bytes = ethers.getBytes(candidate);
  if (bytes.length !== 32) {
    throw new Error('salt must be 32 bytes');
  }
  return ethers.hexlify(bytes);
}

async function commit(jobId, approve, saltArg, subdomain, proof) {
  const nonce = await validation.jobNonce(jobId);
  const salt = saltArg
    ? normaliseSalt(saltArg)
    : ethers.hexlify(ethers.randomBytes(32));
  const commitHash = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bool', 'bytes32'],
    [ethers.getBigInt(jobId), ethers.getBigInt(nonce), approve, salt]
  );
  const tx = await validation.commitValidation(
    jobId,
    commitHash,
    subdomain,
    proof
  );
  await tx.wait();
  const record = saveRecord(jobId, wallet.address, {
    jobId: jobId.toString(),
    validator: wallet.address,
    approve,
    salt,
    commitHash,
    commitTx: tx.hash,
    committedAt: new Date().toISOString(),
  });
  console.log('Committed validation', tx.hash);
  console.log('Stored salt at', storagePath(jobId, wallet.address));
  console.log('Record:', record);
}

async function reveal(jobId, approveArg, saltArg, subdomain, proof) {
  const record = loadRecord(jobId, wallet.address);
  const approve = typeof approveArg === 'boolean' ? approveArg : record.approve;
  if (typeof approve !== 'boolean') {
    throw new Error('Approve flag missing. Provide it or commit first.');
  }
  const saltSource = saltArg || record.salt;
  if (!saltSource) {
    throw new Error('Salt missing. Provide it or ensure commit record exists.');
  }
  const salt = normaliseSalt(saltSource);
  const tx = await validation.revealValidation(
    jobId,
    approve,
    salt,
    subdomain,
    proof
  );
  await tx.wait();
  const updated = saveRecord(jobId, wallet.address, {
    approve,
    salt,
    revealTx: tx.hash,
    revealedAt: new Date().toISOString(),
  });
  console.log('Revealed validation', tx.hash);
  console.log('Updated record:', updated);
}

async function main() {
  const [action, jobIdArg, approveArg, arg4, arg5] = process.argv.slice(2);
  if (!action || !jobIdArg) {
    console.error(
      'Usage: node examples/commit-reveal.js commit|reveal jobId approve [salt] [subdomain]'
    );
    process.exit(1);
  }
  const jobId = BigInt(jobIdArg);
  const approveValue =
    typeof approveArg === 'undefined' ? undefined : approveArg === 'true';
  const proof = [];
  if (action === 'commit') {
    if (approveValue === undefined) {
      throw new Error('Approve flag required for commit');
    }
    const saltInput = isHexSalt(arg4) ? arg4 : undefined;
    const subdomain = isHexSalt(arg4) ? arg5 || '' : arg4 || '';
    await commit(jobId, approveValue, saltInput, subdomain, proof);
  } else if (action === 'reveal') {
    const saltInput = isHexSalt(arg4) ? arg4 : undefined;
    const subdomain = isHexSalt(arg4) ? arg5 || '' : arg4 || '';
    await reveal(jobId, approveValue, saltInput, subdomain, proof);
  } else {
    console.error('Unknown action', action);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
