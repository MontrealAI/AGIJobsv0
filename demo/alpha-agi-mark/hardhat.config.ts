import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// Use the compiler already pinned by the repository lockfile, including offline runs.
const longVersion: string = require("solc").version();
if (!longVersion.startsWith("0.8.26+")) throw new Error("Alpha MARK requires lockfile solc 0.8.26");
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }: { solcVersion: string }) => {
  if (solcVersion !== "0.8.26") throw new Error("Unexpected Alpha MARK compiler version");
  return { compilerPath: require.resolve("solc/soljson.js"), isSolcJs: true, version: solcVersion, longVersion };
});

function parseKeyList(value?: string): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
    ),
  );
}

const rpcUrl = process.env.ALPHA_MARK_RPC_URL?.trim();
const networkName = process.env.ALPHA_MARK_NETWORK?.trim() || "hardhat";
const chainIdRaw = process.env.ALPHA_MARK_CHAIN_ID;
const chainId = chainIdRaw ? Number(chainIdRaw) : undefined;

const ownerKey = process.env.ALPHA_MARK_OWNER_KEY;
const investorKeys = parseKeyList(process.env.ALPHA_MARK_INVESTOR_KEYS);
const validatorKeys = parseKeyList(process.env.ALPHA_MARK_VALIDATOR_KEYS);

const externalAccounts = [ownerKey, ...investorKeys, ...validatorKeys].filter((value): value is string => Boolean(value));

const hasExternalConfig = Boolean(rpcUrl || ownerKey || chainIdRaw || investorKeys.length || validatorKeys.length || networkName !== "hardhat");
if (hasExternalConfig) {
  if (networkName === "hardhat") throw new Error("External Alpha MARK configuration requires an explicit ALPHA_MARK_NETWORK other than hardhat");
  if (!rpcUrl || !ownerKey) throw new Error("External Alpha MARK requires ALPHA_MARK_RPC_URL and ALPHA_MARK_OWNER_KEY");
  if (!chainIdRaw || !/^[1-9][0-9]*$/.test(chainIdRaw) || !Number.isSafeInteger(chainId)) {
    throw new Error("External Alpha MARK requires a positive safe integer ALPHA_MARK_CHAIN_ID");
  }
  let rpcProtocol: string;
  try { rpcProtocol = new URL(rpcUrl).protocol; } catch { throw new Error("Invalid ALPHA_MARK_RPC_URL"); }
  if (rpcProtocol !== "http:" && rpcProtocol !== "https:") throw new Error("ALPHA_MARK_RPC_URL must use HTTP or HTTPS");
  if (externalAccounts.some((key) => !/^0x[0-9a-fA-F]{64}$/.test(key))) throw new Error("Alpha MARK private keys must be 32-byte hexadecimal values");
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    version: "0.8.26",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 500,
      },
    },
  },
  paths: {
    root: ".",
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    ...(hasExternalConfig
      ? {
          [networkName]: {
            url: rpcUrl,
            accounts: externalAccounts,
            chainId,
          },
        }
      : {}),
  },
};

export default config;
