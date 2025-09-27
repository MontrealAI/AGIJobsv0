import { ethers } from "ethers";
import { getAAProvider } from "./providers/aa.js";
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

export async function getSignerForUser(userId: string, overrideMode?: string) {
  const mode = normalizeTxMode(overrideMode);
  if (mode === "aa") {
    return getAAProvider(userId);
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
