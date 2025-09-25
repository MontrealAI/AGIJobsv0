import { ethers } from "ethers";
import { deterministicWalletFromMnemonic } from "./signer.js";

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const provider = new ethers.JsonRpcProvider(rpcUrl);

type CachedWallet = { fingerprint: string; wallet: ethers.Wallet };

const relayerWalletCache = new Map<string, CachedWallet>();

function cacheKey(userId: string) {
  return userId;
}

function getFingerprint() {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (key) {
    return `pk:${key}`;
  }
  const mnemonic = process.env.RELAYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "RELAYER_MNEMONIC must be configured when RELAYER_PRIVATE_KEY is not provided.",
    );
  }
  return `mnemonic:${ethers.id(mnemonic)}`;
}

function deriveWallet(userId: string) {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (key) {
    return new ethers.Wallet(key, provider);
  }
  const mnemonic = process.env.RELAYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "RELAYER_MNEMONIC must be configured when RELAYER_PRIVATE_KEY is not provided.",
    );
  }
  return deterministicWalletFromMnemonic(mnemonic, userId, provider);
}

export async function getRelayerWallet(userId: string) {
  const key = cacheKey(userId);
  const fingerprint = getFingerprint();
  const cached = relayerWalletCache.get(key);
  if (cached && cached.fingerprint === fingerprint) {
    return cached.wallet;
  }
  const wallet = deriveWallet(userId);
  relayerWalletCache.set(key, { fingerprint, wallet });
  return wallet;
}
