import { readFileSync } from 'node:fs';
const data = JSON.parse(
  readFileSync('docs/production/ethereum-mainnet-2026-10-12.json', 'utf8'),
);
if (
  data.schema !== 'agi-jobs/operator-reported-mainnet-evidence/v1' ||
  data.chainId !== 1 ||
  data.deployedSourceCommit !== 'b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e' ||
  data.finalizedPausedTransactionHash !==
    '0x982bb93de4d3922e3cdfd2886468b5d4943344c3b852e2741b3c6bdcfa1aeb5f' ||
  data.productionApproved !== false ||
  data.paidIntakeAuthorized !== false ||
  data.managedModulesPausedAsLastChecked !== 8 ||
  data.managedModulesExpected !== 8 ||
  data.handoff.coordinatorHandoffComplete !== false ||
  data.handoff.identityRegistryPendingOwnerAcceptance !== true ||
  data.operatorReportedExplorerVerified !== 23 ||
  data.operatorReportedExplorerRemaining.length !== 1 ||
  data.operatorReportedExplorerRemaining[0] !== 'StakeManagerEscrow' ||
  data.contractInventory.length !== 24 ||
  new Set(data.contractInventory.map((x) => x.address.toLowerCase())).size !== 24 ||
  data.contractInventory.filter((x) =>
    x.etherscanSourceVerification.startsWith('verified'),
  ).length !== 23
) {
  throw new Error('Source-evidence snapshot mismatched or overclaimed');
}
console.log('PUBLIC_MAINNET_EVIDENCE_INVARIANTS_PASS');
