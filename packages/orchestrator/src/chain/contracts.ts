import { ethers } from "ethers";
import { CONTRACT_ADDRESSES } from "./addresses";
import { rpc } from "./provider";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const STAKE_MANAGER_ABI = [
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
];

const JOB_REGISTRY_ABI = [
  "event JobCreated(uint256 indexed jobId)",
  "function createJob(uint256 reward, string uri) returns (uint256)",
  "function applyForJob(uint256 jobId)",
  "function completeJob(uint256 jobId, string uri)",
];

const VALIDATION_MODULE_ABI = ["function finalize(uint256 jobId)"];

const DISPUTE_MODULE_ABI = ["function raiseDispute(uint256 jobId, string reason)"];

export function loadContracts(signerOrProvider?: ethers.Signer | ethers.Provider) {
  const connection = signerOrProvider ?? rpc();

  const erc20 = new ethers.Contract(
    CONTRACT_ADDRESSES.AGIALPHA_TOKEN,
    ERC20_ABI,
    connection
  );

  const stakeManager = new ethers.Contract(
    CONTRACT_ADDRESSES.STAKE_MANAGER,
    STAKE_MANAGER_ABI,
    connection
  );

  const jobRegistry = new ethers.Contract(
    CONTRACT_ADDRESSES.JOB_REGISTRY,
    JOB_REGISTRY_ABI,
    connection
  );

  const validationModule = new ethers.Contract(
    CONTRACT_ADDRESSES.VALIDATION_MODULE,
    VALIDATION_MODULE_ABI,
    connection
  );

  const disputeModule = new ethers.Contract(
    CONTRACT_ADDRESSES.DISPUTE_MODULE,
    DISPUTE_MODULE_ABI,
    connection
  );

  return { erc20, stakeManager, jobRegistry, validationModule, disputeModule };
}
