const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// Canonical $AGIALPHA token uses 18 decimals
const { decimals: AGIALPHA_DECIMALS } = require('../config/agialpha.json');
const TOKEN_DECIMALS = AGIALPHA_DECIMALS;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

const provider = new ethers.JsonRpcProvider(requireEnv('RPC_URL'));
const signer = new ethers.Wallet(requireEnv('PRIVATE_KEY'), provider);

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

function isBytes32Hash(value) {
  return typeof value === 'string' && ethers.isHexString(value, 32);
}

function callRaiseDispute(registryContract, jobId, payload, overrides) {
  const hasOverrides =
    overrides && typeof overrides === 'object' && Object.keys(overrides).length;

  if (isBytes32Hash(payload)) {
    const method = registryContract['raiseDispute(uint256,bytes32)'];
    if (typeof method !== 'function') {
      throw new Error('Registry is missing raiseDispute(uint256,bytes32)');
    }
    const args = [jobId, ethers.zeroPadValue(payload, 32)];
    return hasOverrides ? method(...args, overrides) : method(...args);
  }

  const method = registryContract['raiseDispute(uint256,string)'];
  if (typeof method !== 'function') {
    throw new Error('Registry is missing raiseDispute(uint256,string)');
  }
  const args = [jobId, payload];
  return hasOverrides ? method(...args, overrides) : method(...args);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toBigInt(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function toBytes32(
  value,
  { label, randomIfMissing = false, allowText = false } = {}
) {
  if (value === undefined || value === null || value === '') {
    if (randomIfMissing) {
      return ethers.hexlify(ethers.randomBytes(32));
    }
    return ethers.ZeroHash;
  }

  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    if (lowered === 'auto' || lowered === 'random') {
      return ethers.hexlify(ethers.randomBytes(32));
    }
  }

  if (ethers.isHexString(value)) {
    return ethers.zeroPadValue(value, 32);
  }

  if (allowText && typeof value === 'string') {
    return ethers.keccak256(ethers.toUtf8Bytes(value));
  }

  throw new Error(
    `Expected 32-byte hex string for ${label || 'bytes32'} (received ${value})`
  );
}

function normaliseProof(proof) {
  if (!proof) {
    return [];
  }
  if (!Array.isArray(proof)) {
    throw new Error('Validator proof must be an array of bytes32 values.');
  }
  return proof.map((entry, index) => {
    if (!ethers.isHexString(entry)) {
      throw new Error(`Validator proof entry ${index} must be a hex string.`);
    }
    return ethers.zeroPadValue(entry, 32);
  });
}

function parseValidationOptions(args) {
  const options = { subdomain: '', proof: [] };
  for (const arg of args) {
    if (arg === undefined || arg === null) continue;
    if (typeof arg === 'string') {
      if (!options.subdomain) {
        options.subdomain = arg;
      } else if (!options.burnTxHash) {
        options.burnTxHash = arg;
      } else if (!options.salt) {
        options.salt = arg;
      }
    } else if (Array.isArray(arg)) {
      options.proof = arg;
    } else if (isPlainObject(arg)) {
      Object.assign(options, arg);
    }
  }
  if (!options.proof) options.proof = [];
  if (!options.subdomain) options.subdomain = '';
  return options;
}

function specAmountToWei(amount, decimals) {
  if (!amount) return 0n;
  const str = String(amount).trim();
  if (!str) return 0n;
  const base = BigInt(str);
  const scale = decimals > 6 ? BigInt(10) ** BigInt(decimals - 6) : 1n;
  return base * scale;
}

function formatUnits(value) {
  return ethers.formatUnits(value, TOKEN_DECIMALS);
}

async function computeValidationCommit(jobIdInput, approve, options = {}) {
  if (typeof approve !== 'boolean') {
    throw new Error('The `approve` flag must be a boolean.');
  }

  const jobId = BigInt(jobIdInput);

  const validator = options.validator
    ? ethers.getAddress(options.validator)
    : await signer.getAddress();

  const providedChainId = toBigInt(options.chainId, 'chainId');
  const chainId =
    providedChainId !== undefined
      ? providedChainId
      : (await provider.getNetwork()).chainId;

  const domainSeparator =
    options.domainSeparator !== undefined
      ? toBytes32(options.domainSeparator, { label: 'domainSeparator' })
      : await validation.DOMAIN_SEPARATOR();

  const providedNonce = toBigInt(options.nonce, 'nonce');
  const nonce =
    providedNonce !== undefined
      ? providedNonce
      : await validation.jobNonce(jobId);

  const specHash =
    options.specHash !== undefined
      ? toBytes32(options.specHash, { label: 'specHash' })
      : await registry.getSpecHash(jobId);

  const burnTxHash = toBytes32(options.burnTxHash, { label: 'burnTxHash' });
  const salt = toBytes32(options.salt, {
    label: 'salt',
    randomIfMissing: true,
  });

  const outcomeHash = ethers.keccak256(
    abiCoder.encode(
      ['uint256', 'bytes32', 'bool', 'bytes32'],
      [nonce, specHash, approve, burnTxHash]
    )
  );

  const commitHash = ethers.keccak256(
    abiCoder.encode(
      ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
      [jobId, outcomeHash, salt, validator, chainId, domainSeparator]
    )
  );

  return {
    commitHash,
    salt,
    burnTxHash,
    nonce,
    specHash,
    chainId,
    validator,
    domainSeparator,
  };
}

const registryAbi = [
  'function acknowledgeTaxPolicy()',
  'function acknowledgeAndCreateJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)',
  'function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri)',
  'function nextJobId() view returns (uint256)',
  'function applyForJob(uint256 jobId, string subdomain, bytes32[] proof)',
  'function submit(uint256 jobId, bytes32 resultHash, string resultURI)',
  'function submit(uint256 jobId, bytes32 resultHash, string resultURI, string subdomain, bytes32[] proof)',
  'function getSpecHash(uint256 jobId) view returns (bytes32)',
  'event JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee, bytes32 specHash, string uri)'
];
const stakeAbi = [
  'function depositStake(uint8 role, uint256 amount)',
  'function acknowledgeAndDeposit(uint8 role, uint256 amount) returns (uint256)'
];
const erc20Abi = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function acceptTerms()',
  'function hasAcknowledged(address account) view returns (bool)'
];
const validationAbi = [
  'function commitValidation(uint256 jobId, bytes32 hash, string subdomain, bytes32[] proof)',
  'function revealValidation(uint256 jobId, bool approve, bytes32 burnTxHash, bytes32 salt, string subdomain, bytes32[] proof)',
  'function finalize(uint256 jobId)',
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)'
];

const attestAbi = [
  'function attest(bytes32 node, uint8 role, address who)',
  'function revoke(bytes32 node, uint8 role, address who)'
];

const registry = new ethers.Contract(
  requireEnv('JOB_REGISTRY'),
  registryAbi,
  signer
);
const stakeManager = new ethers.Contract(
  requireEnv('STAKE_MANAGER'),
  stakeAbi,
  signer
);
const agialphaToken = new ethers.Contract(
  requireEnv('AGIALPHA_TOKEN'),
  erc20Abi,
  signer
);
const validation = new ethers.Contract(
  requireEnv('VALIDATION_MODULE'),
  validationAbi,
  signer
);

const attestation = new ethers.Contract(
  process.env.ATTESTATION_REGISTRY || ethers.ZeroAddress,
  attestAbi,
  signer
);

async function acknowledgeTokenTerms(account) {
  if (!agialphaToken.acceptTerms) return;
  const acknowledged = await agialphaToken.hasAcknowledged(account);
  if (!acknowledged) {
    const tx = await agialphaToken.acceptTerms();
    await tx.wait();
  }
}

async function ensureAllowance(owner, spender, amountWei) {
  const allowance = await agialphaToken.allowance(owner, spender);
  if (allowance >= amountWei) return null;
  const tx = await agialphaToken.approve(spender, amountWei);
  await tx.wait();
  return tx.hash;
}

async function postJob(specOrAmount = '1', options = {}) {
  const employer = await signer.getAddress();
  await acknowledgeTokenTerms(employer);

  let rewardWei;
  let specUri = 'ipfs://job';
  let specHash = ethers.id('spec');
  let specData = null;

  if (isPlainObject(specOrAmount)) {
    specData = specOrAmount;
  } else if (options && isPlainObject(options.spec)) {
    specData = options.spec;
  }

  if (specData) {
    specUri = specData.acceptanceCriteriaURI || specData.resultSchema || specUri;
    specHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(specData, Object.keys(specData).sort()))
    );
    rewardWei = specAmountToWei(specData.escrow?.amountPerItem, TOKEN_DECIMALS);
    if (rewardWei === 0n) {
      rewardWei = ethers.parseUnits('1', TOKEN_DECIMALS);
    }
  } else {
    const amount = specOrAmount !== undefined ? specOrAmount : '1';
    rewardWei = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
  }

  const stakeManagerAddress =
    typeof stakeManager.target === 'string'
      ? stakeManager.target
      : await stakeManager.getAddress();

  await acknowledgeTaxPolicy();
  await ensureAllowance(employer, stakeManagerAddress, rewardWei);

  const nextId = await registry.nextJobId().catch(() => null);
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  let tx;
  try {
    tx = await registry.acknowledgeAndCreateJob(
      rewardWei,
      deadline,
      specHash,
      specUri
    );
  } catch (err) {
    tx = await registry.createJob(rewardWei, deadline, specHash, specUri);
  }
  const receipt = await tx.wait();

  let jobId = nextId ? Number(nextId) : undefined;
  if (!jobId && receipt && receipt.logs) {
    for (const log of receipt.logs) {
      try {
        const parsed = registry.interface.parseLog(log);
        if (parsed && parsed.name === 'JobCreated') {
          jobId = Number(parsed.args.jobId);
          break;
        }
      } catch (parseErr) {
        continue;
      }
    }
  }
  if (!jobId) {
    jobId = 1;
  }

  return {
    txHash: receipt?.hash || tx.hash,
    jobId,
    reward: formatUnits(rewardWei),
    deadline,
    specHash,
    specURI: specUri,
  };
}

async function acknowledgeTaxPolicy() {
  if (!registry.acknowledgeTaxPolicy) {
    return { acknowledged: false };
  }
  const tx = await registry.acknowledgeTaxPolicy();
  const receipt = await tx.wait();
  return { acknowledged: true, txHash: receipt?.hash || tx.hash };
}

async function approveStake(amount) {
  const parsed = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
  const owner = await signer.getAddress();
  const stakeManagerAddress =
    typeof stakeManager.target === 'string'
      ? stakeManager.target
      : await stakeManager.getAddress();
  const allowance = await agialphaToken.allowance(
    owner,
    stakeManagerAddress
  );
  if (allowance >= parsed) {
    return { allowance: formatUnits(allowance) };
  }
  const tx = await agialphaToken.approve(stakeManagerAddress, parsed);
  const receipt = await tx.wait();
  return { allowance: formatUnits(parsed), txHash: receipt?.hash || tx.hash };
}

async function prepareStake(amount) {
  const ack = await acknowledgeTaxPolicy();
  const approval = await approveStake(amount);
  return { acknowledged: ack.acknowledged !== false, approval };
}

function roleToId(role) {
  if (!role) return 0;
  const lowered = String(role).toLowerCase();
  if (lowered === 'validator') return 1;
  if (lowered === 'operator') return 2;
  return 0;
}

async function stake(amount, options = {}) {
  const parsed = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
  const roleId = roleToId(options.role);
  await acknowledgeTokenTerms(await signer.getAddress());
  const method = stakeManager.acknowledgeAndDeposit || stakeManager.depositStake;
  const tx = await method(roleId, parsed);
  const receipt = await tx.wait();
  return {
    txHash: receipt?.hash || tx.hash,
    amount: formatUnits(parsed),
    role: options.role || (roleId === 1 ? 'validator' : 'worker'),
  };
}

async function apply(jobId, subdomain, proof) {
  const result = await registry.applyForJob(jobId, subdomain, proof || []);
  const receipt = await result.wait();
  return { txHash: receipt?.hash || result.hash };
}

async function submit(jobId, uri, options = {}) {
  const hash = ethers.id(uri);
  const subdomain = options.subdomain || 'aurora-agent';
  const proof = normaliseProof(options.proof || []);
  let tx;
  if (registry['submit(uint256,bytes32,string,string,bytes32[])']) {
    tx = await registry['submit(uint256,bytes32,string,string,bytes32[])'](
      jobId,
      hash,
      uri,
      subdomain,
      proof
    );
  } else {
    tx = await registry['submit(uint256,bytes32,string)'](jobId, hash, uri);
  }
  const receipt = await tx.wait();
  return {
    txHash: receipt?.hash || tx.hash,
    worker: await signer.getAddress(),
    resultURI: uri,
  };
}

async function validate(jobId, commitOrApprove, ...rest) {
  const [maybeSubdomain, maybeProof, maybeApprove, maybeSalt, maybeBurn] = rest;

  if (
    typeof commitOrApprove === 'string' &&
    commitOrApprove.startsWith('0x') &&
    typeof maybeApprove === 'boolean'
  ) {
    const subdomain = typeof maybeSubdomain === 'string' ? maybeSubdomain : '';
    const proof = normaliseProof(Array.isArray(maybeProof) ? maybeProof : []);
    const approve = maybeApprove;
    const salt = toBytes32(maybeSalt, { label: 'salt' });
    const burnTxHash = toBytes32(maybeBurn, { label: 'burnTxHash' });

    const commitTx = await validation.commitValidation(
      jobId,
      ethers.zeroPadValue(commitOrApprove, 32),
      subdomain,
      proof
    );
    await commitTx.wait();

    const revealTx = await validation.revealValidation(
      jobId,
      approve,
      burnTxHash,
      salt,
      subdomain,
      proof
    );
    await revealTx.wait();

    const finalizeTx = await validation.finalize(jobId);
    await finalizeTx.wait();

    return {
      commitHash: ethers.zeroPadValue(commitOrApprove, 32),
      salt,
      burnTxHash,
      commits: 1,
      reveals: 1,
      finalizeTx: finalizeTx.hash,
    };
  }

  const approve = commitOrApprove;
  const options = parseValidationOptions(rest);
  const proof = normaliseProof(options.proof);

  const plan = await computeValidationCommit(jobId, approve, options);

  const commitTx = await validation.commitValidation(
    jobId,
    plan.commitHash,
    options.subdomain,
    proof
  );
  await commitTx.wait();

  const revealTx = await validation.revealValidation(
    jobId,
    approve,
    plan.burnTxHash,
    plan.salt,
    options.subdomain,
    proof
  );
  await revealTx.wait();

  let finalizeTxHash = null;
  if (!options.skipFinalize) {
    const finalizeTx = await validation.finalize(jobId);
    const finalizeReceipt = await finalizeTx.wait();
    finalizeTxHash = finalizeReceipt?.hash || finalizeTx.hash;
  }

  return {
    ...plan,
    commits: 1,
    reveals: 1,
    finalizeTx: finalizeTxHash,
  };
}

async function dispute(jobId, evidence) {
  const tx = await callRaiseDispute(registry, jobId, evidence);
  const receipt = await tx.wait();
  return { txHash: receipt?.hash || tx.hash };
}

async function attest(name, role, delegate) {
  if (!attestation.target || attestation.target === ethers.ZeroAddress) {
    throw new Error('ATTESTATION_REGISTRY environment variable not configured');
  }
  const node = ethers.namehash(name);
  const tx = await attestation.attest(node, role, delegate);
  const receipt = await tx.wait();
  return { txHash: receipt?.hash || tx.hash };
}

async function revoke(name, role, delegate) {
  if (!attestation.target || attestation.target === ethers.ZeroAddress) {
    throw new Error('ATTESTATION_REGISTRY environment variable not configured');
  }
  const node = ethers.namehash(name);
  const tx = await attestation.revoke(node, role, delegate);
  const receipt = await tx.wait();
  return { txHash: receipt?.hash || tx.hash };
}

function parseCliArgs(tokens) {
  const positional = [];
  const options = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = tokens[i + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      i++;
    }
  }
  return { positional, options };
}

async function runCli() {
  const [, , command, ...rest] = process.argv;
  if (!command) {
    console.error('Usage: node examples/ethers-quickstart.js <command> [--options]');
    process.exit(1);
  }
  const { positional, options } = parseCliArgs(rest);

  try {
    let result;
    switch (command) {
      case 'postJob': {
        let spec = null;
        if (options.spec) {
          const specPath = path.resolve(options.spec);
          spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        }
        if (spec) {
          result = await postJob(spec);
        } else {
          const amount = positional[0] || options.amount || '1';
          result = await postJob(amount);
        }
        break;
      }
      case 'acknowledgeTaxPolicy':
        result = await acknowledgeTaxPolicy();
        break;
      case 'approveStake':
        result = await approveStake(options.amount || positional[0] || '1');
        break;
      case 'prepareStake':
        result = await prepareStake(options.amount || positional[0] || '1');
        break;
      case 'stake':
        result = await stake(options.amount || positional[0] || '1', {
          role: options.role || positional[1],
        });
        break;
      case 'apply':
        result = await apply(
          Number(options.job || positional[0]),
          options.subdomain || positional[1] || 'aurora-agent',
          []
        );
        break;
      case 'submit':
        result = await submit(
          Number(options.job || positional[0]),
          options.result || positional[1],
          { subdomain: options.subdomain || 'aurora-agent' }
        );
        break;
      case 'computeValidationCommit':
        result = await computeValidationCommit(
          Number(options.job || positional[0]),
          String(options.approve || positional[1]).toLowerCase() === 'true',
          {}
        );
        break;
      case 'validate': {
        const jobId = Number(options.job || positional[0]);
        const approve = String(options.approve || positional[1]).toLowerCase() === 'true';
        if (options.commit) {
          const commitPath = path.resolve(options.commit);
          const plan = JSON.parse(fs.readFileSync(commitPath, 'utf8'));
          result = await validate(
            jobId,
            plan.commitHash,
            plan.subdomain || '',
            plan.proof || [],
            approve,
            plan.salt,
            plan.burnTxHash
          );
        } else {
          result = await validate(jobId, approve, {
            subdomain: options.subdomain || 'aurora-validator',
            proof: [],
          });
        }
        break;
      }
      case 'dispute':
        result = await dispute(
          Number(options.job || positional[0]),
          options.evidence || positional[1]
        );
        break;
      case 'attest':
        result = await attest(
          options.name || positional[0],
          Number(options.role || positional[1]),
          options.delegate || positional[2]
        );
        break;
      case 'revoke':
        result = await revoke(
          options.name || positional[0],
          Number(options.role || positional[1]),
          options.delegate || positional[2]
        );
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
    console.log(JSON.stringify(result ?? {}, null, 2));
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  postJob,
  acknowledgeTaxPolicy,
  approveStake,
  prepareStake,
  stake,
  apply,
  submit,
  validate,
  dispute,
  attest,
  revoke,
  computeValidationCommit,
  __test__: {
    callRaiseDispute,
    isBytes32Hash,
  },
};

