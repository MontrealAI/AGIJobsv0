'use strict';
const ethers = require('ethers');
const { digest, lower, insist } = require('./evidence.cjs');
const REQUIRED_MODULES = [
  'jobRegistry',
  'stakeManager',
  'validationModule',
  'disputeModule',
  'platformRegistry',
  'feePool',
  'reputationEngine',
  'arbitratorCommittee',
];
function getterFunctions(artifact) {
  return artifact.artifact.abi.filter(
    (f) =>
      f.type === 'function' &&
      ['view', 'pure'].includes(f.stateMutability) &&
      !f.inputs?.length &&
      f.outputs?.length === 1 &&
      /^(address|bool|u?int[0-9]*|bytes[0-9]+|string)$/.test(f.outputs[0].type)
  );
}
async function snapshotState(provider, archive, report, activation, blockTag) {
  insist(
    activation?.operation === 'unpauseAll',
    'Only explicitly requested unpauseAll can be qualified'
  );
  insist(
    ethers.isAddress(activation.systemPause) &&
      ethers.isAddress(activation.governance),
    'Missing activation target or governance'
  );
  const selected = report.creations.find(
    (c) => lower(c.address) === lower(activation.systemPause)
  );
  insist(
    selected?.fullyQualified === 'contracts/v2/SystemPause.sol:SystemPause',
    'Activation target is not the inventoried SystemPause'
  );
  const pause = new ethers.Interface(
    archive.contracts.get(selected.fullyQualified).artifact.abi
  );
  const state = [];
  const addresses = new Set([
    ...report.creations.map((c) => lower(c.address)),
    ...report.reused
      .filter((c) => c.status === 'reviewed')
      .map((c) => lower(c.address)),
  ]);
  async function read(address, iface, name) {
    const signature = name.includes('(') ? name : `${name}()`;
    const data = iface.encodeFunctionData(signature, []);
    const raw = await provider.call({ to: address, data, blockTag });
    return iface.decodeFunctionResult(signature, raw)[0];
  }
  for (const name of ['owner', 'governance'])
    insist(
      lower(await read(activation.systemPause, pause, name)) ===
        lower(activation.governance),
      `SystemPause ${name} differs from qualified governance`
    );
  for (const name of REQUIRED_MODULES) {
    const address = await read(activation.systemPause, pause, name);
    insist(
      address !== ethers.ZeroAddress &&
        report.creations.some((c) => lower(c.address) === lower(address)),
      `Uninventoried required module ${name}`
    );
    const iface = new ethers.Interface([
      'function owner() view returns(address)',
      'function paused() view returns(bool)',
    ]);
    insist(
      lower(await read(address, iface, 'owner')) ===
        lower(activation.systemPause),
      `${name} owner is not SystemPause`
    );
    insist(
      (await read(address, iface, 'paused')) === true,
      `${name} must remain paused during qualification`
    );
  }
  // Bind every scalar zero-argument getter exposed by deployed ABIs, including
  // module pointers, owners, governance, pause state and economic parameters.
  // Non-enumerable mappings and security approval remain separate commissioning work.
  for (const entry of report.creations) {
    const artifact = archive.contracts.get(entry.fullyQualified),
      iface = new ethers.Interface(artifact.artifact.abi);
    for (const fn of getterFunctions(artifact)) {
      const value = await read(entry.address, iface, `${fn.name}()`);
      if (
        fn.outputs[0].type === 'address' &&
        value !== ethers.ZeroAddress &&
        !addresses.has(lower(value))
      ) {
        const code = await provider.getCode(value, blockTag);
        insist(
          code === '0x',
          `Unreviewed attached dependency ${entry.address}.${fn.name}: ${value}`
        );
      }
      state.push({
        address: lower(entry.address),
        function: `${fn.name}()`,
        value:
          typeof value === 'bigint'
            ? value.toString()
            : typeof value === 'string' && fn.outputs[0].type === 'address'
            ? value.toLowerCase()
            : value,
      });
    }
  }
  return state.sort((a, b) =>
    `${a.address}:${a.function}`.localeCompare(`${b.address}:${b.function}`)
  );
}
async function qualify({ provider, archive, manifest, report }) {
  insist(
    report.manifestSha256 === digest(manifest) &&
      report.archiveSha256 === archive.indexSha256,
    'Qualification evidence identity mismatch'
  );
  insist(
    report.blockers.length === 0,
    'Incomplete verification: ' + report.blockers.join('; ')
  );
  insist(
    report.creations.length > 0 &&
      report.creations.every(
        (c) => c.status === 'verified' && c.explorer?.status === 'verified'
      ),
    'Every actual creation must be exactly explorer-verified'
  );
  insist(
    report.transactions.every((t) =>
      ['canonical-success', 'canonical-revert', 'replaced'].includes(t.status)
    ),
    'Unresolved creation transaction'
  );
  insist(
    report.reused.every((r) => r.status === 'reviewed'),
    'Unreviewed external dependency'
  );
  const state = await snapshotState(
    provider,
    archive,
    report,
    manifest.activation,
    report.observedBlock.number
  );
  const observation = await provider.getBlock(report.observedBlock.number);
  insist(
    lower(observation?.hash) === lower(report.observedBlock.hash),
    'Qualification observation reorged'
  );
  const payload = {
    schema: 'agijobsv0/qualified-activation/1',
    operation: 'unpauseAll',
    activation: manifest.activation,
    chainId: report.chainId,
    releaseId: report.releaseId,
    manifestSha256: digest(manifest),
    archiveSha256: archive.indexSha256,
    report,
    state,
    stateSha256: digest(state),
    sourceVerificationQualified: true,
    productionApproved: false,
  };
  return { payload, payloadSha256: digest(payload) };
}
async function assertQualifiedActivation({
  provider,
  archive,
  manifest,
  receipt,
  explorer,
  target,
  operation = 'unpauseAll',
}) {
  insist(
    receipt?.payload && receipt.payloadSha256 === digest(receipt.payload),
    'Qualification receipt digest mismatch'
  );
  const q = receipt.payload;
  insist(
    q.schema === 'agijobsv0/qualified-activation/1' &&
      q.sourceVerificationQualified === true &&
      q.productionApproved === false,
    'Missing qualified activation receipt'
  );
  insist(
    operation === 'unpauseAll' &&
      q.operation === operation &&
      q.activation.operation === operation,
    'Receipt does not authorize this operation'
  );
  insist(
    lower(target) === lower(q.activation.systemPause) &&
      digest(q.activation) === digest(manifest.activation),
    'Wrong activation target/configuration'
  );
  insist(
    q.manifestSha256 === digest(manifest) &&
      q.archiveSha256 === archive.indexSha256 &&
      q.releaseId === manifest.releaseId,
    'Stale or different release/archive/manifest'
  );
  insist(q.stateSha256 === digest(q.state), 'State evidence digest mismatch');
  insist(
    String((await provider.getNetwork()).chainId) === q.chainId &&
      String(manifest.chainId) === q.chainId,
    'Wrong activation chain'
  );
  const report = q.report;
  insist(
    report.manifestSha256 === q.manifestSha256 &&
      report.blockers.length === 0 &&
      report.creations.length > 0 &&
      report.creations.every(
        (c) => c.status === 'verified' && c.explorer?.status === 'verified'
      ),
    'Incomplete qualification report'
  );
  insist(
    report.transactions.every((t) =>
      ['canonical-success', 'canonical-revert', 'replaced'].includes(t.status)
    ),
    'Unresolved transaction evidence'
  );
  const head = await provider.getBlockNumber(),
    block = await provider.getBlock(head);
  insist(
    Number.isSafeInteger(manifest.maxQualificationAgeBlocks) &&
      manifest.maxQualificationAgeBlocks >= 1,
    'Missing qualification freshness policy'
  );
  insist(
    head >= report.observedBlock.number &&
      head - report.observedBlock.number <= manifest.maxQualificationAgeBlocks,
    'Qualification receipt is stale'
  );
  const observed = await provider.getBlock(report.observedBlock.number);
  insist(
    lower(observed?.hash) === lower(report.observedBlock.hash),
    'Qualification block reorged'
  );
  // Reconcile again before signing: a newly mined orphan or replacement cannot
  // silently inherit yesterday's complete-address receipt. This is read-only.
  const fresh = await require('./reconcile.cjs').reconcile({
    provider,
    archive,
    manifest,
    explorer,
  });
  insist(
    fresh.blockers.length === 0,
    'Current reconciliation has unresolved verification'
  );
  insist(
    fresh.creationSetSha256 === report.creationSetSha256,
    'Actual creation address/runtime set changed'
  );
  insist(
    digest(fresh.creations) === digest(report.creations),
    'Exact creation/compiler/explorer identity changed'
  );
  insist(
    digest(fresh.reused) === digest(report.reused),
    'Reused dependency evidence changed'
  );
  const state = await snapshotState(
    provider,
    archive,
    report,
    manifest.activation,
    head
  );
  insist(
    digest(state) === q.stateSha256,
    'Wiring/ownership/configuration changed since qualification'
  );
  insist(
    lower((await provider.getBlock(head))?.hash) === lower(block.hash),
    'Activation observation reorged'
  );
  return {
    qualified: true,
    governance: q.activation.governance,
    observedBlock: head,
  };
}
module.exports = {
  snapshotState,
  qualify,
  assertQualifiedActivation,
  getterFunctions,
  REQUIRED_MODULES,
};
