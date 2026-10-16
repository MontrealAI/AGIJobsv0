'use strict';

const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');
const { assertChain } = require('./authority-runtime.cjs');
const modules = require('../../config/implementation-modules.json');
const historical = require('../../docs/deployment-addresses.mainnet.json');
const historicalAddresses = new Set(
  [
    ...Object.entries(historical)
      .filter(
        ([key, value]) =>
          key !== 'token' &&
          typeof value === 'string' &&
          ethers.isAddress(value)
      )
      .map(([, value]) => value),
    ...Object.values(historical.implementations),
  ]
    .filter((address) => address !== ethers.ZeroAddress)
    .map((address) => address.toLowerCase())
);

function assertNewAddress(address) {
  if (historicalAddresses.has(ethers.getAddress(address).toLowerCase()))
    throw new Error(
      'Historical deployment address is excluded from this new-deployment writer'
    );
}

async function assertCreationScope(provider, chainId, scope) {
  if (
    !scope ||
    scope.chainId !== chainId ||
    !Number.isSafeInteger(scope.initialBlock?.number) ||
    scope.initialBlock.number < 0 ||
    !ethers.isHexString(scope.initialBlock.hash, 32)
  )
    throw new Error(
      'New deployment requires its original canonical creation-block anchor'
    );
  const campaign = scope.campaign;
  if (
    !campaign ||
    campaign.chainId !== chainId ||
    !Number.isSafeInteger(campaign.blockNumber) ||
    campaign.blockNumber < 0 ||
    !ethers.isHexString(campaign.blockHash, 32) ||
    scope.initialBlock.number < campaign.blockNumber
  )
    throw new Error(
      'Creation predates or lacks the reviewed campaign block anchor'
    );
  await assertChain(provider, chainId);
  if (
    (await provider.getBlock(campaign.blockNumber))?.hash !== campaign.blockHash
  )
    throw new Error('Reviewed campaign block anchor is not canonical');
  const block = await provider.getBlock(scope.initialBlock.number);
  if (
    block?.hash !== scope.initialBlock.hash ||
    block.timestamp !== scope.initialBlock.timestamp
  )
    throw new Error('New-deployment initial block anchor is not canonical');
}

function validateAuthorityRoles(config, creator) {
  const governance = ethers.getAddress(config.governance);
  if (
    governance === ethers.ZeroAddress ||
    (creator && governance === ethers.getAddress(creator))
  )
    throw new Error(
      'Explicit nonzero governance must differ from the creation wallet'
    );
  const roles = config.authority;
  const keys = ['stakeManagerTreasury', 'feePoolTreasury', 'feePoolGovernance'];
  if (!roles || Object.keys(roles).sort().join() !== keys.sort().join())
    throw new Error(`Explicit authority roles required: ${keys.join(', ')}`);
  const result = {};
  for (const key of keys) {
    const value = ethers.getAddress(roles[key]);
    if (
      value === ethers.ZeroAddress ||
      (creator && value === ethers.getAddress(creator))
    )
      throw new Error(
        `authority.${key} must be nonzero and distinct from the creation wallet`
      );
    result[key] = value;
  }
  return result;
}

function moduleId(name) {
  return ethers.id(
    `${name}:${
      name.startsWith('JobRegistry')
        ? 'percentage-stake-v4'
        : name.startsWith('ValidationModule')
        ? 'terminal-reputation-v3'
        : 'v1'
    }`
  );
}

function acquireDeploymentLock(directory, identity) {
  if (!directory || !path.isAbsolute(directory))
    throw new Error(
      'DEPLOYMENT_LOCK_DIRECTORY must name an explicit shared absolute directory'
    );
  const root = fs.realpathSync(directory);
  const lock = path.join(
    root,
    `${BigInt(identity.chainId)}-${ethers
      .getAddress(identity.creator)
      .toLowerCase()}`
  );
  fs.mkdirSync(lock, { mode: 0o700 });
  const file = path.join(lock, 'owner.json');
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(
      fd,
      JSON.stringify({
        ...identity,
        pid: process.pid,
        createdAt: new Date().toISOString(),
      }) + '\n'
    );
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  for (const directory of [lock, root]) {
    const fd = fs.openSync(directory, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  const held = fs.statSync(lock);
  return {
    path: lock,
    release() {
      const current = fs.lstatSync(lock);
      if (
        !current.isDirectory() ||
        current.ino !== held.ino ||
        current.dev !== held.dev
      )
        throw new Error('Deployment lock changed; reconcile it manually');
      fs.unlinkSync(file);
      fs.rmdirSync(lock);
    },
  };
}

function readRecoveryEvidence(file) {
  const bytes = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(bytes);
  } catch (error) {
    if (!file.endsWith('.jsonl')) throw error;
    // A failed append cannot authorize a send: checkpoint is awaited first.
    // Recover the last whole fsynced checkpoint, never a truncated last line.
    const lines = bytes.split('\n');
    lines.pop();
    if (!lines.length)
      throw new Error('No complete deployment journal checkpoint');
    let last;
    for (const line of lines) last = JSON.parse(line);
    return last;
  }
}

// The intent is fsynced by checkpoint BEFORE asking a signer to submit. An
// uncertain submission is never retried automatically. Recover by hash, or by
// its exact sender/nonce/data in canonical blocks, including mined orphans.
function createAuthorityHandover({
  provider,
  signer,
  runtime,
  chainId,
  creator,
  governance,
  token,
  readSource,
  operations,
  checkpoint,
  creationScope,
}) {
  creator = ethers.getAddress(creator);
  governance = ethers.getAddress(governance);
  if (
    !operations ||
    creator === governance ||
    governance === ethers.ZeroAddress ||
    creationScope?.creator !== creator ||
    creationScope?.governance !== governance ||
    creationScope?.chainId !== chainId
  )
    throw new Error('Invalid authority handover context');
  const ownableAbi = [
    'function owner() view returns(address)',
    'function governance() view returns(address)',
    'function deployed() view returns(bool)',
    'function moduleId() view returns(bytes32)',
    'function transferOwnership(address)',
  ];
  async function save() {
    await checkpoint({ authorityOperations: operations });
  }
  async function checkedReceipt(op, transaction) {
    await assertCreationScope(provider, chainId, creationScope);
    if (
      !transaction ||
      ethers.getAddress(transaction.from) !== creator ||
      transaction.nonce !== op.nonce ||
      BigInt(transaction.chainId) !== BigInt(chainId) ||
      (transaction.to || null)?.toLowerCase() !== op.to?.toLowerCase() ||
      ethers.keccak256(transaction.data) !== op.dataHash ||
      BigInt(transaction.value) !== 0n
    )
      throw new Error(`Authority transaction identity mismatch: ${op.name}`);
    const receipt = await provider.getTransactionReceipt(transaction.hash);
    if (!receipt)
      throw new Error(
        `Authority transaction pending: ${op.name}; preserve evidence and resume later`
      );
    if (
      receipt.status !== 1 ||
      receipt.blockNumber <= creationScope.initialBlock.number ||
      !Number.isSafeInteger(op.startBlock) ||
      op.startBlock < creationScope.initialBlock.number ||
      op.startBlock > receipt.blockNumber ||
      (await provider.getBlock(receipt.blockNumber))?.hash !== receipt.blockHash
    )
      throw new Error(
        `Authority transaction failed or noncanonical: ${op.name}`
      );
    if (
      !op.to &&
      (ethers.getAddress(receipt.contractAddress) !== op.address ||
        ethers.getCreateAddress({ from: creator, nonce: op.nonce }) !==
          op.address)
    )
      throw new Error(`Authority creation address mismatch: ${op.name}`);
    op.hash = transaction.hash;
    op.receipt = {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: receipt.status,
      contractAddress: receipt.contractAddress,
    };
    await save();
    return receipt;
  }
  async function recover(op) {
    const source = readSource(op.name, op.to || op.address, { token });
    if (
      op.source !== source.source ||
      op.compilerInputSha256 !== source.compilerInputSha256 ||
      op.creationCodeHash !== ethers.keccak256(source.bytecode)
    )
      throw new Error(`Authority journal source mismatch: ${op.name}`);
    await assertChain(provider, chainId);
    if (op.hash)
      return checkedReceipt(op, await provider.getTransaction(op.hash));
    const latest = await provider.getBlock('latest');
    // An interrupted signer can leave an intent with no transaction hash.
    // Scan only the bounded interval recorded by that intent; never guess a tx.
    if (latest.number - op.startBlock > 2048)
      throw new Error(
        `Authority intent needs explicit transaction reconciliation: ${op.name}`
      );
    for (let number = op.startBlock; number <= latest.number; number += 1) {
      const block = await provider.getBlock(number, true);
      for (const hash of block.transactions) {
        const tx = await provider.getTransaction(hash);
        if (
          tx?.from.toLowerCase() === creator.toLowerCase() &&
          tx.nonce === op.nonce
        )
          return checkedReceipt(op, tx);
      }
    }
    throw new Error(
      `Unresolved authority submission: ${op.name}; reconcile the recorded nonce before any retry`
    );
  }
  async function execute(key, name, to, data, submit) {
    await assertChain(provider, chainId);
    await assertCreationScope(provider, chainId, creationScope);
    if (to) assertNewAddress(to);
    const dataHash = ethers.keccak256(data);
    const source = readSource(name, to || ethers.ZeroAddress, { token });
    const sourceBinding = {
      source: source.source,
      compilerInputSha256: source.compilerInputSha256,
      creationCodeHash: ethers.keccak256(source.bytecode),
    };
    let op = operations[key];
    if (op) {
      if (
        op.name !== name ||
        op.role !== key ||
        op.to !== to ||
        op.dataHash !== dataHash ||
        op.chainId !== chainId ||
        op.creator !== creator ||
        op.value !== '0' ||
        Object.entries(sourceBinding).some(
          ([key, value]) => op[key] !== value
        ) ||
        !Number.isSafeInteger(op.nonce)
      )
        throw new Error(`Authority journal identity mismatch: ${key}`);
      await recover(op);
      return op;
    }
    if (!signer || ethers.getAddress(await signer.getAddress()) !== creator)
      throw new Error(`Creation signer required for ${key}`);
    const nonce = await provider.getTransactionCount(creator, 'pending');
    if (nonce !== (await provider.getTransactionCount(creator, 'latest')))
      throw new Error(
        'Creation wallet has pending transactions; reconcile before assigning a nonce'
      );
    op = operations[key] = {
      name,
      role: key,
      chainId,
      creator,
      nonce,
      to,
      value: '0',
      dataHash,
      ...sourceBinding,
      startBlock: (await provider.getBlock('latest')).number,
      ...(!to
        ? { address: ethers.getCreateAddress({ from: creator, nonce }) }
        : {}),
    };
    if (op.address) assertNewAddress(op.address);
    await save();
    const tx = await submit(nonce);
    op.hash = tx.hash;
    await save();
    await tx.wait();
    await checkedReceipt(op, await provider.getTransaction(tx.hash));
    return op;
  }
  async function checkRuntime(name, address, implementations = {}) {
    await assertChain(provider, chainId);
    const source = readSource(name, address, { token, implementations });
    if (
      (await provider.getCode(address)).toLowerCase() !==
      source.runtime.toLowerCase()
    )
      throw new Error(
        `Authority runtime/source mismatch: ${name} at ${address}`
      );
    return source;
  }
  async function deploy(name, overrides = {}) {
    const source = readSource(name, ethers.ZeroAddress, { token });
    const factory = await runtime.getContractFactory(source.source, signer);
    if (factory.bytecode !== source.bytecode)
      throw new Error(`Authority factory/source mismatch: ${name}`);
    const op = await execute(
      `create:${name}`,
      name,
      null,
      source.bytecode,
      async (nonce) =>
        (await factory.deploy({ ...overrides, nonce })).deploymentTransaction()
    );
    await checkRuntime(name, op.address);
    return factory.attach(op.address);
  }
  async function handover(name, address) {
    assertNewAddress(address);
    const creation = operations[`create:${name}`];
    const source = readSource(name, address, { token });
    if (
      !creation ||
      creation.address !== ethers.getAddress(address) ||
      creation.name !== name ||
      creation.role !== `create:${name}` ||
      creation.chainId !== chainId ||
      creation.creator !== creator ||
      creation.dataHash !== ethers.keccak256(source.bytecode)
    )
      throw new Error(
        `Handover requires this run's new creation journal: ${name}`
      );
    await recover(creation);
    await checkRuntime(name, address);
    const contract = await runtime.getContractAt(
      ownableAbi,
      address,
      signer || provider
    );
    if (name === 'Deployer' && !(await contract.deployed()))
      throw new Error('Coordinator handover requires finalized deployment');
    const governable =
      name.startsWith('JobRegistry') || name.startsWith('StakeManager');
    const current = ethers.getAddress(await contract.owner());
    if (
      governable &&
      ethers.getAddress(await contract.governance()) !== current
    )
      throw new Error(`Authority owner/governance mismatch: ${name}`);
    if (![creator, governance].includes(current))
      throw new Error(
        `Unexpected authority owner: ${name} at ${address}: ${current}`
      );
    const data = contract.interface.encodeFunctionData('transferOwnership', [
      governance,
    ]);
    if (operations[`handover:${name}`]) {
      await execute(`handover:${name}`, name, address, data);
    } else if (current === creator) {
      await execute(`handover:${name}`, name, address, data, (nonce) =>
        contract.transferOwnership(governance, { nonce })
      );
    }
    // A cached 'completed' journal is never a substitute for fresh state.
    if (
      ethers.getAddress(await contract.owner()) !== governance ||
      (governable &&
        ethers.getAddress(await contract.governance()) !== governance)
    )
      throw new Error(`Authority handover readback failed: ${name}`);
    await save();
  }
  return {
    deploy,
    checkFactory(name, factory, sourceName) {
      const placeholders = Object.fromEntries(
        Object.values(modules)
          .flat()
          .map((name) => [name, ethers.ZeroAddress])
      );
      const source = readSource(name, ethers.ZeroAddress, {
        token,
        implementations: placeholders,
      });
      if (
        source.source !== sourceName ||
        factory.bytecode !== source.bytecode ||
        factory.interface.formatJson() !==
          new ethers.Interface(source.abi).formatJson()
      )
        throw new Error(`Component factory/source mismatch: ${name}`);
    },
    async checkComponentRuntime(name, address, args) {
      const implementations = Object.fromEntries(
        (modules[name] || []).map((name, index) => [name, args.at(-1)[index]])
      );
      return checkRuntime(name, address, implementations);
    },
    handover,
    checkRuntime,
    async reconcile() {
      const usedNonces = new Set();
      for (const [key, operation] of Object.entries(operations)) {
        if (
          operation.chainId !== chainId ||
          operation.creator !== creator ||
          operation.role !== key ||
          operation.value !== '0' ||
          usedNonces.has(operation.nonce)
        )
          throw new Error(`Authority journal identity mismatch: ${key}`);
        usedNonces.add(operation.nonce);
        await recover(operation);
      }
    },
    async send(key, name, address, data, overrides = {}) {
      await checkRuntime(name, address);
      return execute(key, name, address, data, (nonce) =>
        signer.sendTransaction({
          ...overrides,
          to: address,
          data,
          value: 0n,
          nonce,
        })
      );
    },
    async implementation(name, existingAddress) {
      if (!Object.values(modules).flat().includes(name))
        throw new Error(`Unknown implementation: ${name}`);
      if (existingAddress && !operations[`create:${name}`])
        throw new Error(
          `Existing implementation has no new-creation journal: ${name}`
        );
      const contract = await deploy(name);
      const address = await contract.getAddress();
      if (existingAddress && ethers.getAddress(existingAddress) !== address)
        throw new Error(
          `Fixed implementation differs from creation journal: ${name}`
        );
      if ((await contract.moduleId()) !== moduleId(name))
        throw new Error(`Implementation identity mismatch: ${name}`);
      await handover(name, address);
      return address;
    },
  };
}

module.exports = {
  createAuthorityHandover,
  validateAuthorityRoles,
  moduleId,
  acquireDeploymentLock,
  readRecoveryEvidence,
  assertNewAddress,
  assertCreationScope,
};
