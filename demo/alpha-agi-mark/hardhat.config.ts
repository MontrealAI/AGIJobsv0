import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

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

const rpcUrl = process.env.ALPHA_MARK_RPC_URL;
const networkName = process.env.ALPHA_MARK_NETWORK ?? "hardhat";
const chainIdRaw = process.env.ALPHA_MARK_CHAIN_ID;
const chainId = chainIdRaw ? Number(chainIdRaw) : undefined;

const ownerKey = process.env.ALPHA_MARK_OWNER_KEY;
const investorKeys = parseKeyList(process.env.ALPHA_MARK_INVESTOR_KEYS);
const validatorKeys = parseKeyList(process.env.ALPHA_MARK_VALIDATOR_KEYS);

const externalAccounts = [ownerKey, ...investorKeys, ...validatorKeys].filter((value): value is string => Boolean(value));

const config: HardhatUserConfig = {
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
    ...(rpcUrl && ownerKey
      ? {
          [networkName]: {
            url: rpcUrl,
            accounts: externalAccounts,
            ...(chainId ? { chainId } : {}),
          },
        }
      : {}),
  },
};

export default config;
