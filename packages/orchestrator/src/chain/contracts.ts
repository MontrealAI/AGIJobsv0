import { ethers } from "ethers";
import { CONTRACT_METADATA } from "./addresses.js";
import { rpc } from "./provider.js";

type ContractInstances = {
  erc20: ethers.Contract;
  stakeManager: ethers.Contract;
  jobRegistry: ethers.Contract;
  validationModule: ethers.Contract;
  disputeModule: ethers.Contract;
  feePool: ethers.Contract;
};

function instantiate(
  key: keyof typeof CONTRACT_METADATA,
  signerOrProvider?: ethers.Signer | ethers.Provider
): ethers.Contract {
  const connection = signerOrProvider ?? rpc();
  const { address, abi } = CONTRACT_METADATA[key];
  return new ethers.Contract(address, abi, connection);
}

export function loadContracts(
  signerOrProvider?: ethers.Signer | ethers.Provider
): ContractInstances {
  return {
    erc20: instantiate("agialphaToken", signerOrProvider),
    stakeManager: instantiate("stakeManager", signerOrProvider),
    jobRegistry: instantiate("jobRegistry", signerOrProvider),
    validationModule: instantiate("validationModule", signerOrProvider),
    disputeModule: instantiate("disputeModule", signerOrProvider),
    feePool: instantiate("feePool", signerOrProvider),
  };
}
