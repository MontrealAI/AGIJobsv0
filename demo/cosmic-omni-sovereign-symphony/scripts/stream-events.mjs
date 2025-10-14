import fs from "fs";
import path from "path";
import { ethers } from "ethers";

const deploymentLog = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "logs", "deployment-latest.json");
const rpcUrl = process.env.ETH_RPC_URL;

if (!rpcUrl) {
  throw new Error("ETH_RPC_URL must be defined");
}

let contractAddress = process.env.GOVERNANCE_ADDRESS;
if (!contractAddress) {
  if (!fs.existsSync(deploymentLog)) {
    throw new Error("Set GOVERNANCE_ADDRESS or provide deployment log");
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentLog, "utf-8"));
  contractAddress = deployment.contract;
}

const abi = [
  "event NationRegistered(bytes32 indexed nationId, address indexed governor, uint96 votingWeight, string metadataURI)",
  "event NationUpdated(bytes32 indexed nationId, address indexed governor, uint96 votingWeight, bool active, string metadataURI)",
  "event NationStatusChanged(bytes32 indexed nationId, bool active)",
  "event MandateCreated(bytes32 indexed mandateId, uint256 quorum, uint256 startTimestamp, uint256 endTimestamp, string metadataURI)",
  "event MandateUpdated(bytes32 indexed mandateId, uint256 quorum, uint256 startTimestamp, uint256 endTimestamp, bool executed, string metadataURI)",
  "event MandateVote(bytes32 indexed mandateId, bytes32 indexed nationId, bool support, uint256 weight, string metadataURI)"
];

const provider = new ethers.JsonRpcProvider(rpcUrl);
const contract = new ethers.Contract(contractAddress, abi, provider);

console.log(`[stream] Subscribing to events from ${contractAddress}`);
contract.on("NationRegistered", (...args) => emitEvent("NationRegistered", args));
contract.on("NationUpdated", (...args) => emitEvent("NationUpdated", args));
contract.on("NationStatusChanged", (...args) => emitEvent("NationStatusChanged", args));
contract.on("MandateCreated", (...args) => emitEvent("MandateCreated", args));
contract.on("MandateUpdated", (...args) => emitEvent("MandateUpdated", args));
contract.on("MandateVote", (...args) => emitEvent("MandateVote", args));

function emitEvent(name, args) {
  const event = args[args.length - 1];
  const payload = {
    name,
    blockNumber: event.log.blockNumber,
    transactionHash: event.log.transactionHash,
    data: args.slice(0, -1).map((value) => (typeof value === "bigint" ? value.toString() : value))
  };
  console.log(JSON.stringify(payload));
}

process.on("SIGINT", () => {
  console.log("[stream] Shutting down");
  contract.removeAllListeners();
  process.exit(0);
});
