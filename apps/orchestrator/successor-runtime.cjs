'use strict';

// Native import stays in JavaScript so the CommonJS TypeScript build cannot
// rewrite it into require() of the canonical ESM modules.
exports.loadSuccessorBridge = async () => {
  const [bridges, authority] = await Promise.all([
    import('../../packages/successor-core/src/bridges.mjs'),
    import('../../packages/successor-core/src/authority.mjs'),
  ]);
  return { ...bridges, ...authority };
};

exports.loadSuccessorIntegrity = () =>
  import('../../packages/successor-core/src/integrity.mjs');
exports.loadSuccessorSignatures = () =>
  import('../../packages/successor-core/src/signatures.mjs');
exports.loadSuccessorInstitution = async () => {
  const [compiler, institution] = await Promise.all([
    import('../../packages/successor-core/src/compiler.mjs'),
    import('../../packages/successor-core/src/institution.mjs'),
  ]);
  return { ...compiler, ...institution };
};

exports.reconcileSuccessorSettlement = async (
  registry,
  request,
  deployment
) => {
  const { Contract, keccak256, toUtf8Bytes } = require('ethers');
  const { describeSettlementLink: describeSuccessorSettlement } = await import(
    '../../packages/successor-core/src/bridges.mjs'
  );
  if (
    deployment.mode !== 'fixture' ||
    !['31337', '1337'].includes(deployment.chainId)
  )
    throw new Error(
      'UNCOMMISSIONED_RUNTIME: successor settlement reconciliation is local-chain only'
    );
  if (
    typeof request.jobId !== 'string' ||
    !/^[1-9][0-9]{0,79}$/.test(request.jobId) ||
    typeof request.transactionHash !== 'string' ||
    !/^0x[0-9a-fA-F]{64}$/.test(request.transactionHash)
  )
    throw new Error('Invalid settlement job or transaction identity');
  if (
    typeof request.committedSpec !== 'string' ||
    Buffer.byteLength(request.committedSpec, 'utf8') > 524288 ||
    Buffer.from(request.committedSpec, 'utf8').toString('utf8') !==
      request.committedSpec
  )
    throw new Error(
      'Original bounded UTF-8 committed specification is required'
    );
  const spec = JSON.parse(request.committedSpec);
  const binding = spec?.metadata?.successorComputerWork;
  if (
    binding?.missionId !== request.missionId ||
    binding?.workOrderDigest !== request.workOrderDigest
  )
    throw new Error(
      'Committed specification does not bind the requested mission and work order'
    );
  const provider = registry.runner?.provider;
  if (
    !provider ||
    (await provider.getNetwork()).chainId.toString() !== deployment.chainId ||
    (await registry.getAddress()).toLowerCase() !==
      deployment.registryAddress.toLowerCase()
  )
    throw new Error('Registry/provider differs from the trusted deployment');
  const job = await registry.jobs(BigInt(request.jobId));
  const specHash = keccak256(toUtf8Bytes(request.committedSpec));
  if (job.specHash !== specHash)
    throw new Error(
      'Original specification does not match the on-chain job commitment'
    );
  if (
    typeof request.completedDeliverable !== 'string' ||
    Buffer.byteLength(request.completedDeliverable, 'utf8') > 524288 ||
    Buffer.from(request.completedDeliverable, 'utf8').toString('utf8') !==
      request.completedDeliverable
  )
    throw new Error('Original bounded UTF-8 completed deliverable is required');
  const resultHash = keccak256(toUtf8Bytes(request.completedDeliverable));
  if (job.resultHash !== resultHash)
    throw new Error(
      'Completed deliverable does not match the on-chain result commitment'
    );
  const receipt = await provider.getTransactionReceipt(request.transactionHash);
  if (
    !receipt ||
    receipt.status !== 1 ||
    receipt.hash.toLowerCase() !== request.transactionHash.toLowerCase()
  )
    throw new Error('Successful canonical settlement receipt is unavailable');
  const manager = new Contract(
    await registry.stakeManager(),
    ['function token() view returns (address)'],
    provider
  );
  const [block, head, decimals, actualToken] = await Promise.all([
    provider.getBlock(receipt.blockNumber),
    provider.getBlockNumber(),
    new Contract(
      deployment.tokenAddress,
      ['function decimals() view returns (uint8)'],
      provider
    ).decimals(),
    manager.token(),
  ]);
  if (!block || block.hash !== receipt.blockHash || head < receipt.blockNumber)
    throw new Error('Settlement receipt is not in the current canonical chain');
  if (Number(decimals) !== deployment.decimals)
    throw new Error(
      'On-chain token decimals differ from the trusted deployment'
    );
  if (actualToken.toLowerCase() !== deployment.tokenAddress.toLowerCase())
    throw new Error(
      'Registry staking token differs from the trusted deployment'
    );
  const events = receipt.logs
    .filter(
      (log) =>
        log.address.toLowerCase() === deployment.registryAddress.toLowerCase()
    )
    .flatMap((log) => {
      try {
        const event = registry.interface.parseLog(log);
        return event &&
          ['JobFinalized', 'JobPayout'].includes(event.name) &&
          event.args.jobId.toString() === request.jobId
          ? [{ event, log }]
          : [];
      } catch {
        return [];
      }
    });
  const finalized = events.filter((item) => item.event.name === 'JobFinalized');
  const payouts = events.filter((item) => item.event.name === 'JobPayout');
  if (
    finalized.length !== 1 ||
    payouts.length !== 1 ||
    finalized[0].event.args.worker.toLowerCase() !==
      payouts[0].event.args.worker.toLowerCase()
  )
    throw new Error(
      'Receipt lacks one matching registry JobFinalized and JobPayout event'
    );
  const payout = payouts[0];
  const amountMinor = (
    BigInt(payout.event.args.base) + BigInt(payout.event.args.bonus)
  ).toString();
  const observation = await describeSuccessorSettlement(
    {
      schemaVersion: '1.0.0',
      mode: deployment.mode,
      missionId: request.missionId,
      workOrderDigest: request.workOrderDigest,
      chainId: deployment.chainId,
      registryAddress: deployment.registryAddress,
      tokenAddress: deployment.tokenAddress,
      tokenSymbol: deployment.tokenSymbol,
      decimals: deployment.decimals,
      jobId: request.jobId,
      amountMinor,
      status: 'confirmed',
      transactionHash: receipt.hash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
      logIndex: payout.log.index,
      confirmations: head - receipt.blockNumber + 1,
      canonical: true,
    },
    deployment
  );
  const checked = await provider.getBlock(receipt.blockNumber);
  if (!checked || checked.hash !== receipt.blockHash)
    throw new Error('Settlement changed during reconciliation');
  return {
    ...observation,
    chainObserved: true,
    evidenceScope: 'configured-local-rpc',
    amountBasis: 'registry-payout-event',
    specHash,
    resultHash,
    worker: payout.event.args.worker,
    assessmentAt: new Date().toISOString(),
  };
};
