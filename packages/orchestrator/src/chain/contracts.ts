import { ethers } from "ethers";
import { CONTRACT_ADDRESSES } from "./addresses.js";
import { rpc } from "./provider.js";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const STAKE_MANAGER_ABI = [
  "function depositStake(uint8 role, uint256 amount)",
  "function withdrawStake(uint8 role, uint256 amount)",
];

const JOB_REGISTRY_ABI = [
  "event JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee, bytes32 specHash, string uri)",
  "function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256 jobId)",
  "function applyForJob(uint256 jobId, string subdomain, bytes32[] proof)",
  "function submit(uint256 jobId, bytes32 resultHash, string resultURI, string subdomain, bytes32[] proof)",
  "function finalizeAfterValidation(uint256 jobId, bool success)",
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
