import { getAllContractMetadata } from "./metadata.js";

const metadata = getAllContractMetadata();

export const CONTRACT_ADDRESSES = {
  AGIALPHA_TOKEN: metadata.agialphaToken.address,
  STAKE_MANAGER: metadata.stakeManager.address,
  JOB_REGISTRY: metadata.jobRegistry.address,
  VALIDATION_MODULE: metadata.validationModule.address,
  DISPUTE_MODULE: metadata.disputeModule.address,
  FEE_POOL: metadata.feePool.address,
};

export const CONTRACT_METADATA = metadata;
