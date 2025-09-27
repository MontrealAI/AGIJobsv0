import { ethers } from "ethers";
import { deterministicWalletFromMnemonic } from "./signer.js";

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";

const provider = new ethers.JsonRpcProvider(rpcUrl);

type CachedWallet = { fingerprint: string; wallet: ethers.Wallet };

const userWalletCache = new Map<string, CachedWallet>();

let sponsorWalletCache: CachedWallet | null = null;

function cacheKey(userId: string) {
  return userId;
}

function userFingerprint() {
  const key = process.env.RELAYER_USER_PRIVATE_KEY;
  if (key) {
    return `pk:${key}`;
  }
  const mnemonic = process.env.RELAYER_USER_MNEMONIC ?? process.env.RELAYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "RELAYER_USER_MNEMONIC (or RELAYER_MNEMONIC) must be configured when RELAYER_USER_PRIVATE_KEY is not provided."
    );
  }
  return `mnemonic:${ethers.id(mnemonic)}`;
}

function sponsorFingerprint() {
  const key = process.env.RELAYER_SPONSOR_PRIVATE_KEY ?? process.env.RELAYER_PRIVATE_KEY;
  if (key) {
    return `pk:${key}`;
  }
  const mnemonic = process.env.RELAYER_SPONSOR_MNEMONIC ?? process.env.RELAYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "RELAYER_SPONSOR_MNEMONIC (or RELAYER_MNEMONIC) must be configured when RELAYER_SPONSOR_PRIVATE_KEY is not provided."
    );
  }
  return `mnemonic:${ethers.id(mnemonic)}`;
}

function deriveUserWallet(userId: string) {
  const key = process.env.RELAYER_USER_PRIVATE_KEY;
  if (key) {
    return new ethers.Wallet(key, provider);
  }
  const mnemonic = process.env.RELAYER_USER_MNEMONIC ?? process.env.RELAYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "RELAYER_USER_MNEMONIC (or RELAYER_MNEMONIC) must be configured when RELAYER_USER_PRIVATE_KEY is not provided."
    );
  }
  return deterministicWalletFromMnemonic(mnemonic, userId, provider);
}

function deriveSponsorWallet() {
  const key = process.env.RELAYER_SPONSOR_PRIVATE_KEY ?? process.env.RELAYER_PRIVATE_KEY;
  if (key) {
    return new ethers.Wallet(key, provider);
  }
  const mnemonic = process.env.RELAYER_SPONSOR_MNEMONIC ?? process.env.RELAYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "RELAYER_SPONSOR_MNEMONIC (or RELAYER_MNEMONIC) must be configured when RELAYER_SPONSOR_PRIVATE_KEY is not provided."
    );
  }
  return deterministicWalletFromMnemonic(mnemonic, "relayer-sponsor", provider);
}

export async function getRelayerUserWallet(userId: string) {
  const key = cacheKey(userId);
  const fingerprint = userFingerprint();
  const cached = userWalletCache.get(key);
  if (cached && cached.fingerprint === fingerprint) {
    return cached.wallet;
  }
  const wallet = deriveUserWallet(userId);
  userWalletCache.set(key, { fingerprint, wallet });
  return wallet;
}

export async function getRelayerSponsorWallet() {
  const fingerprint = sponsorFingerprint();
  if (sponsorWalletCache && sponsorWalletCache.fingerprint === fingerprint) {
    return sponsorWalletCache.wallet;
  }
  const wallet = deriveSponsorWallet();
  sponsorWalletCache = { fingerprint, wallet };
  return wallet;
}

export async function getRelayerWallet(userId: string) {
  return getRelayerUserWallet(userId);
}

