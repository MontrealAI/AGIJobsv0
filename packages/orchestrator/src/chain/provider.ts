import { ethers } from "ethers";
import { getAAProvider as getAAProviderImpl } from "./providers/aa.js";
import { getMetaTxSigner } from "./providers/metaTx.js";
import { getRelayerWallet } from "./providers/relayer.js";

type NormalizedTxMode = "relayer" | "aa" | "direct";

function normalizeTxMode(value: string | undefined): NormalizedTxMode {
  const raw = (value ?? process.env.TX_MODE ?? "relayer").trim().toLowerCase();
  if (!raw) {
    return "relayer";
  }
  if (["aa", "account-abstraction", "account_abstraction", "4337"].includes(raw)) {
    return "aa";
  }
  if (["direct", "raw"].includes(raw)) {
    return "direct";
  }
  return "relayer";
}

const FALLBACK_NETWORK_KEYWORDS = new Set([
  "sepolia",
  "sep",
  "opsepolia",
  "optimismsepolia",
]);

const FALLBACK_CHAIN_IDS = new Set([
  "11155111",
  "0xaa36a7",
  "11155420",
  "0xaa37dc",
]);

function normalize(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

function normalizeNetworkKeyword(value?: string): string | undefined {
  const normalized = normalize(value);
  if (!normalized) return undefined;
  const canonical = normalized.replace(/[-_\s]/g, "");
  return canonical ? canonical : undefined;
}

function shouldFallbackToMetaTx(): boolean {
  const explicit = normalize(
    process.env.AA_FALLBACK_TO_2771 ?? process.env.AA_ALLOW_2771_FALLBACK
  );
  if (explicit === "true") {
    return true;
  }
  if (explicit === "false") {
    return false;
  }
  const networkCandidates = [
    normalizeNetworkKeyword(process.env.AA_NETWORK),
    normalizeNetworkKeyword(process.env.NETWORK),
    normalizeNetworkKeyword(process.env.HARDHAT_NETWORK),
  ];
  for (const candidate of networkCandidates) {
    if (candidate && FALLBACK_NETWORK_KEYWORDS.has(candidate)) {
      return true;
    }
  }
  const chainCandidates = [
    normalize(process.env.AA_CHAIN_ID),
    normalize(process.env.CHAIN_ID),
  ];
  for (const candidate of chainCandidates) {
    if (candidate && FALLBACK_CHAIN_IDS.has(candidate)) {
      return true;
    }
  }
  return false;
}

type AAProviderFactory = typeof getAAProviderImpl;

let aaProviderFactory: AAProviderFactory = getAAProviderImpl;

export function __setAAProviderFactoryForTests(factory?: AAProviderFactory) {
  aaProviderFactory = factory ?? getAAProviderImpl;
}

export async function getSignerForUser(userId: string, overrideMode?: string) {
  const mode = normalizeTxMode(overrideMode);
  if (mode === "aa") {
    try {
      return await aaProviderFactory(userId);
    } catch (error) {
      if (shouldFallbackToMetaTx()) {
        console.warn(
          "Account abstraction signer unavailable, falling back to EIP-2771 for",
          userId,
          error instanceof Error ? error.message : error
        );
        return getMetaTxSigner(userId);
      }
      throw error;
    }
  }
  if (mode === "direct") {
    return getRelayerWallet(userId);
  }
  return getMetaTxSigner(userId);
}

export function rpc() {
  const url = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  return new ethers.JsonRpcProvider(url);
}
