'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const { verifyReceipt } = require('./verify-receipt.cjs');
const { assertPinnedAlphaCheckout } = require('./pinned-alpha-checkout.cjs');
const { address: TOKEN } = require('../../config/agialpha.json');

const sha256 = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');
const requiredPath = (name) => {
  const value = process.env[name];
  assert(
    path.isAbsolute(value || ''),
    `${name} requires an absolute reviewed path`
  );
  return value;
};
function boundedUtf8(filename, maxBytes) {
  assert(
    Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 8_388_608
  );
  const fd = fs.openSync(
    filename,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const stat = fs.fstatSync(fd);
    assert(
      stat.isFile() && stat.size <= maxBytes,
      'Input must be a bounded regular file'
    );
    const chunk = Buffer.alloc(Math.min(maxBytes + 1, 64 * 1024));
    const chunks = [];
    let used = 0;
    while (used <= maxBytes) {
      const count = fs.readSync(
        fd,
        chunk,
        0,
        Math.min(chunk.length, maxBytes + 1 - used),
        null
      );
      if (count === 0) break;
      chunks.push(Buffer.from(chunk.subarray(0, count)));
      used += count;
    }
    const after = fs.fstatSync(fd);
    assert(
      used <= maxBytes &&
        used === stat.size &&
        after.size === stat.size &&
        after.mtimeMs === stat.mtimeMs &&
        after.ctimeMs === stat.ctimeMs,
      'Input grew or changed during bounded read'
    );
    const bytes = Buffer.concat(chunks, used);
    const text = bytes.toString('utf8');
    assert(
      Buffer.from(text, 'utf8').equals(bytes),
      'Input must be exact UTF-8'
    );
    return text;
  } finally {
    fs.closeSync(fd);
  }
}
async function confirmed(operation) {
  const transaction = await operation;
  const receipt = await transaction.wait();
  assert.equal(receipt.status, 1);
  return transaction;
}

async function observeMockGas(provider, firstBlock, lastBlock) {
  assert(Number.isSafeInteger(firstBlock) && firstBlock >= 0);
  assert(
    Number.isSafeInteger(lastBlock) &&
      lastBlock > firstBlock &&
      lastBlock - firstBlock <= 1000
  );
  const quantity = (value) => {
    assert(/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value));
    return BigInt(value);
  };
  const receipts = [];
  let totalGasUsed = 0n;
  let totalMockFeeWei = 0n;
  for (let number = firstBlock + 1; number <= lastBlock; number++) {
    const block = await provider.send('eth_getBlockByNumber', [
      '0x' + number.toString(16),
      false,
    ]);
    assert.equal(quantity(block.number), BigInt(number));
    assert(/^0x[a-f0-9]{64}$/.test(block.hash));
    assert(Array.isArray(block.transactions));
    assert(block.transactions.length <= 1000);
    for (const [index, hash] of block.transactions.entries()) {
      assert(/^0x[a-f0-9]{64}$/.test(hash));
      const receipt = await provider.send('eth_getTransactionReceipt', [hash]);
      assert.equal(receipt.transactionHash, hash);
      assert.equal(receipt.blockHash, block.hash);
      assert.equal(quantity(receipt.blockNumber), BigInt(number));
      assert.equal(quantity(receipt.transactionIndex), BigInt(index));
      const status = quantity(receipt.status);
      assert(status === 0n || status === 1n);
      const gasUsed = quantity(receipt.gasUsed);
      const price = quantity(receipt.effectiveGasPrice);
      assert(gasUsed > 0n);
      const fee = gasUsed * price;
      totalGasUsed += gasUsed;
      totalMockFeeWei += fee;
      receipts.push({
        transactionHash: hash,
        blockHash: block.hash,
        blockNumber: number,
        transactionIndex: index,
        status: Number(status),
        gasUsed: gasUsed.toString(),
        effectiveGasPriceWei: price.toString(),
        mockFeeWei: fee.toString(),
      });
    }
  }
  assert(receipts.length > 0);
  assert.equal(
    new Set(receipts.map((receipt) => receipt.transactionHash)).size,
    receipts.length
  );
  return {
    classification: 'DISPOSABLE_MOCK_GAS_NOT_REAL_EXPENDITURE',
    scope:
      'all mined fixture transactions including deployment, setup and both job outcomes',
    firstIncludedBlock: firstBlock + 1,
    lastIncludedBlock: lastBlock,
    receipts,
    totalGasUsed: totalGasUsed.toString(),
    totalMockFeeWei: totalMockFeeWei.toString(),
    publicNetworkEstimate: false,
    realAssetExpenditure: false,
  };
}

async function assertDisposableNetwork(network, provider) {
  assert.equal(
    network.name,
    'hardhat',
    'Only the disposable in-process Hardhat network is supported'
  );
  assert.equal(network.config.url, undefined, 'External RPC is prohibited');
  assert.equal(network.config.forking, undefined, 'Forks are prohibited');
  assert.equal((await provider.getNetwork()).chainId, 31337n);
  const metadata = await provider.send('hardhat_metadata');
  assert(!metadata.forkedNetwork, 'A fork is not a fresh disposable fixture');
}

async function main() {
  const started = performance.now();
  const inputFile = requiredPath('FQR_DRAFT_FILE');
  const alphaRoot = requiredPath('FQR_ALPHA_SOURCE');
  const outputFile = requiredPath('FQR_EVIDENCE_FILE');
  assert(!fs.existsSync(outputFile), 'Evidence output must be new');
  assert.notEqual(outputFile, inputFile, 'Evidence cannot replace its input');
  const raw = boundedUtf8(inputFile, 8_388_608);
  const { ethers, artifacts, network } = require('hardhat');
  await assertDisposableNetwork(network, ethers.provider);
  const firstBlock = Number(
    BigInt(await ethers.provider.send('eth_blockNumber'))
  );
  const expectedAlphaCommit = process.env.FQR_ALPHA_COMMIT;
  assert(
    /^[0-9a-f]{40}$/.test(expectedAlphaCommit || ''),
    'FQR_ALPHA_COMMIT must pin the reviewed checkout'
  );
  const actualAlphaCommit = assertPinnedAlphaCheckout(
    alphaRoot,
    expectedAlphaCommit
  );
  const alphaComputerFile = path.join(
    alphaRoot,
    'examples/successor-alpha/computer.mjs'
  );
  const { inspectComputerReturn } = await import(
    pathToFileURL(alphaComputerFile).href
  );
  const { inspectComputerReceiptDraft } = await import(
    './four-repo-computer-receipt.mjs'
  );
  const draft = await inspectComputerReceiptDraft(raw, {
    inspectAlphaReturn: inspectComputerReturn,
  });
  assert.equal(
    draft.bindings.alphaSourceHash,
    sha256(fs.readFileSync(alphaComputerFile))
  );
  assert.equal(draft.route.backend, 'agijobsv0-jobregistry-v2');
  assert.equal(draft.route.asset, 'AGIALPHA');
  assert.equal(draft.route.decimals, 18);
  assert.equal(draft.route.token.toLowerCase(), TOKEN.toLowerCase());
  assert.equal(draft.authority, 'none');
  assert.equal(draft.settlementApproved, false);
  const specHash = '0x' + sha256(raw);
  const resultHash = '0x' + sha256(draft.original.returnRaw);
  assert.equal('sha256:' + resultHash.slice(2), draft.bindings.returnRawSha256);
  const reward = BigInt(draft.planning.amountBaseUnits);
  const forged = JSON.parse(raw);
  const returned = JSON.parse(forged.original.returnRaw);
  returned.observedText += '\nFORGED_UNBOUND_OBSERVATION';
  forged.original.returnRaw = JSON.stringify(returned);
  const [owner, employer, worker] = await ethers.getSigners();
  const nonceBeforeRejection = await ethers.provider.getTransactionCount(
    owner.address
  );
  await assert.rejects(
    inspectComputerReceiptDraft(JSON.stringify(forged), {
      inspectAlphaReturn: inspectComputerReturn,
    })
  );
  assert.equal(
    await ethers.provider.getTransactionCount(owner.address),
    nonceBeforeRejection
  );

  const build = await artifacts.getBuildInfo(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  assert.equal(build.solcVersion, '0.8.37');
  assert.equal(build.input.settings.viaIR, true);
  assert.equal(build.input.settings.optimizer.runs, 200);
  const repositoryRoot = path.resolve(__dirname, '../..');
  for (const [sourcePath, source] of Object.entries(build.input.sources)) {
    const local = path.join(repositoryRoot, sourcePath);
    const installed = fs.existsSync(local)
      ? local
      : path.join(repositoryRoot, 'node_modules', sourcePath);
    assert.equal(
      fs.readFileSync(installed, 'utf8'),
      source.content,
      `Compiler source differs from the installed exact input: ${sourcePath}`
    );
  }

  const tokenArtifact = await artifacts.readArtifact(
    'contracts/test/MockERC20.sol:MockERC20'
  );
  await network.provider.send('hardhat_setCode', [
    TOKEN,
    tokenArtifact.deployedBytecode,
  ]);
  const token = await ethers.getContractAt(
    'contracts/test/MockERC20.sol:MockERC20',
    TOKEN
  );
  const Stake = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const stake = await Stake.deploy(
    0,
    100,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address,
    await deployImplementations('StakeManager', Stake.runner)
  );
  await confirmed(stake.setMinStake(1));
  await confirmed(stake.setSlashingPercentages(100, 0));
  const validation = await (
    await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    )
  ).deploy();
  const Registry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    owner.address,
    await deployImplementations('JobRegistry', Registry.runner)
  );
  const identity = await (
    await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    )
  ).deploy();
  const policy = await (
    await ethers.getContractFactory('contracts/v2/TaxPolicy.sol:TaxPolicy')
  ).deploy(
    'fixture://public-synthetic-policy',
    'Disposable fixture acknowledgement only'
  );
  await confirmed(registry.setIdentityRegistry(await identity.getAddress()));
  await confirmed(registry.setTaxPolicy(await policy.getAddress()));
  await confirmed(policy.connect(employer).acknowledge());
  await confirmed(policy.connect(worker).acknowledge());
  await confirmed(validation.setJobRegistry(await registry.getAddress()));
  await confirmed(stake.setJobRegistry(await registry.getAddress()));
  await confirmed(stake.setValidationModule(await validation.getAddress()));
  await confirmed(registry.setJobStakeBps(1000));
  await confirmed(registry.setMaxJobReward(reward));
  await confirmed(registry.setJobDurationLimit(86400));
  await confirmed(registry.setFeePct(0));
  await confirmed(registry.setValidatorRewardPct(0));
  await confirmed(registry.setMinAgentStake(1));
  await confirmed(token.mint(employer.address, reward * 4n));
  await confirmed(token.mint(worker.address, reward * 4n + 1000n));
  await confirmed(
    token.connect(employer).approve(await stake.getAddress(), reward * 4n)
  );
  await confirmed(
    token.connect(worker).approve(await stake.getAddress(), reward * 2n)
  );
  await confirmed(stake.connect(worker).depositStake(0, reward * 2n));

  const deployment = {
    backend: draft.route.backend,
    chainId: 31337,
    registry: await registry.getAddress(),
    runtimeKeccak256: ethers.keccak256(
      await ethers.provider.getCode(await registry.getAddress())
    ),
  };
  const lifecycle = async (jobId, artifactHash, accepted) => {
    const lifecycleStarted = performance.now();
    const deadline =
      (await ethers.provider.getBlock('latest')).timestamp + 3600;
    const created = await confirmed(
      registry
        .connect(employer)
        .createJob(
          reward,
          deadline,
          specHash,
          'fixture://four-repo/exact-computer-draft'
        )
    );
    const assigned = await confirmed(
      registry.connect(worker).applyForJob(jobId, 'disposable-fixture', [])
    );
    const expectation = {
      jobId: String(jobId),
      worker: worker.address,
      minimumConfirmations: 1,
    };
    assert.equal((await registry.jobs(jobId)).specHash, specHash);
    const assignment = await verifyReceipt(ethers.provider, deployment, {
      ...expectation,
      event: 'AgentAssigned',
      transactionHash: assigned.hash,
    });
    const before = await token.balanceOf(worker.address);
    const uri = accepted
      ? 'fixture://four-repo/exact-native-return'
      : 'fixture://four-repo/rejected-forgery';
    const submitted = await confirmed(
      registry
        .connect(worker)
        .submit(jobId, artifactHash, uri, 'disposable-fixture', [])
    );
    const submissionExpected = {
      ...expectation,
      event: 'ResultSubmitted',
      transactionHash: submitted.hash,
      resultHash: artifactHash,
      resultURI: uri,
    };
    const submission = await verifyReceipt(
      ethers.provider,
      deployment,
      submissionExpected
    );
    await assert.rejects(
      verifyReceipt(ethers.provider, deployment, {
        ...submissionExpected,
        resultHash: ethers.ZeroHash,
      })
    );
    await confirmed(validation.setResult(accepted));
    const checked = await confirmed(validation.finalize(jobId));
    const validationReceipt = await verifyReceipt(ethers.provider, deployment, {
      ...expectation,
      event: 'JobCompleted',
      transactionHash: checked.hash,
      success: accepted,
    });
    assert.equal(
      await token.balanceOf(worker.address),
      before,
      'Submission/validation must not pay the worker'
    );
    if (!accepted) {
      assert.equal((await registry.jobs(jobId)).packedMetadata & 7n, 5n);
      await assert.rejects(registry.connect(employer).finalize(jobId));
      assert.equal(await token.balanceOf(worker.address), before);
      assert.equal(
        (await registry.queryFilter(registry.filters.JobFinalized(jobId)))
          .length,
        0
      );
      return {
        jobId: String(jobId),
        creationTransaction: created.hash,
        assignment,
        submission,
        validation: validationReceipt,
        finalization: null,
        state: 'Disputed',
        workerPayoutBaseUnits: '0',
        settlementPerformed: false,
        elapsedMilliseconds: Math.ceil(performance.now() - lifecycleStarted),
      };
    }
    const finalized = await confirmed(
      registry.connect(employer).finalize(jobId)
    );
    const finalization = await verifyReceipt(ethers.provider, deployment, {
      ...expectation,
      event: 'JobFinalized',
      transactionHash: finalized.hash,
    });
    const delta = (await token.balanceOf(worker.address)) - before;
    assert.equal(delta, reward);
    assert.equal((await registry.jobs(jobId)).packedMetadata & 7n, 6n);
    assert.equal((await registry.jobs(jobId)).resultHash, resultHash);
    await assert.rejects(registry.connect(employer).finalize(jobId));
    return {
      jobId: String(jobId),
      creationTransaction: created.hash,
      assignment,
      submission,
      validation: validationReceipt,
      finalization,
      state: 'Finalized',
      workerPayoutBaseUnits: delta.toString(),
      settlementPerformed: true,
      elapsedMilliseconds: Math.ceil(performance.now() - lifecycleStarted),
    };
  };
  const accepted = await lifecycle(1, resultHash, true);
  const rejectedArtifact = JSON.stringify(returned);
  const rejected = await lifecycle(2, '0x' + sha256(rejectedArtifact), false);
  const gasObservation = await observeMockGas(
    ethers.provider,
    firstBlock,
    Number(BigInt(await ethers.provider.send('eth_blockNumber')))
  );
  const evidence = {
    schema: 'agijobsv0/four-repo-disposable-computer-lifecycle/v1',
    scope: 'fresh-in-process-hardhat-31337',
    inputProvenance:
      process.env.FQR_INPUT_CLASS || 'UNVERIFIED_HISTORICAL_INPUT',
    compiler: {
      version: build.solcLongVersion,
      viaIR: true,
      optimizerRuns: 200,
      evmVersion: build.input.settings.evmVersion,
      inputSha256: sha256(JSON.stringify(build.input)),
      installedSourceCount: Object.keys(build.input.sources).length,
    },
    alphaSourceCommit: actualAlphaCommit,
    draftSha256: sha256(raw),
    nativeReturnSha256: sha256(draft.original.returnRaw),
    project: draft.project,
    bindings: draft.bindings,
    specHash,
    resultHash,
    mockRewardBaseUnits: reward.toString(),
    deployment,
    accepted,
    rejected,
    gasObservation,
    elapsedMilliseconds: Math.ceil(performance.now() - started),
    timingScope:
      'fixture main entry through local receipt collection; compilation and browser execution excluded',
    negativeChecks: [
      'Unbound native observation refused before fixture transaction',
      'Wrong exact result digest refused by receipt verifier',
      'Validation does not settle',
      'Rejected artifact cannot finalize and receives zero payout',
      'Successful job cannot settle twice',
    ],
    authority: [],
    productionApproved: false,
    liveModelQualityEstablished: false,
    independentMarketplaceAcceptance: false,
    limitations: [
      'Mock token code installed only on the ephemeral EVM at configured token address',
      'Permissive identity mock and operator-controlled ValidationStub',
      'Source fixture tests settlement mechanics, not independent content validation',
      'Rejected local job remains disputed with escrow until the disposable process ends',
      'Retained input consistency does not authenticate computer execution',
      'No external RPC, Mainnet, real token, production wallet or authority change',
    ],
  };
  assertPinnedAlphaCheckout(alphaRoot, actualAlphaCommit);
  fs.writeFileSync(outputFile, JSON.stringify(evidence, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      scope: evidence.scope,
      accepted: accepted.state,
      mockPayout: accepted.workerPayoutBaseUnits,
      rejected: rejected.state,
      rejectedPayout: rejected.workerPayoutBaseUnits,
      output: outputFile,
      productionApproved: false,
    })
  );
}

module.exports = { assertDisposableNetwork, observeMockGas, boundedUtf8 };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
