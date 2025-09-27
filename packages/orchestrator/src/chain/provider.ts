import { ethers } from "ethers";
import { getAAProvider } from "./providers/aa.js";
import { getMetaTxSigner } from "./providers/metaTx.js";
import { getRelayerWallet } from "./providers/relayer.js";

function txMode() {
  return (process.env.TX_MODE ?? "relayer").toLowerCase();
}

export async function getSignerForUser(userId: string) {
  const mode = txMode();
  if (mode === "aa" || mode === "account-abstraction") {
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
