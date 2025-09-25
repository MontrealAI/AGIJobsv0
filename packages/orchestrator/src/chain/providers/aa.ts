import { ethers } from "ethers";
import { deterministicWalletFromMnemonic } from "./signer.js";

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const provider = new ethers.JsonRpcProvider(rpcUrl);

type CachedSession = { fingerprint: string; wallet: ethers.Wallet };

const aaWalletCache = new Map<string, CachedSession>();

function fingerprintFromEnv() {
  const key = process.env.AA_SESSION_PRIVATE_KEY;
  if (key) {
    return `pk:${key}`;
  }
  const mnemonic = process.env.AA_SESSION_MNEMONIC ?? process.env.RELAYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "AA_SESSION_MNEMONIC (or RELAYER_MNEMONIC) must be configured when AA_SESSION_PRIVATE_KEY is not provided.",
    );
  }
  return `mnemonic:${ethers.id(mnemonic)}`;
}

function deriveSessionKey(userId: string) {
  const key = process.env.AA_SESSION_PRIVATE_KEY;
  if (key) {
    return new ethers.Wallet(key, provider);
  }
  const mnemonic = process.env.AA_SESSION_MNEMONIC ?? process.env.RELAYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "AA_SESSION_MNEMONIC (or RELAYER_MNEMONIC) must be configured when AA_SESSION_PRIVATE_KEY is not provided.",
    );
  }
  return deterministicWalletFromMnemonic(mnemonic, userId, provider);
}

export async function getAAProvider(userId: string) {
  const fingerprint = fingerprintFromEnv();
  const cached = aaWalletCache.get(userId);
  if (cached && cached.fingerprint === fingerprint) {
    return cached.wallet;
  }
  const wallet = deriveSessionKey(userId);
  aaWalletCache.set(userId, { fingerprint, wallet });
  return wallet;
}
