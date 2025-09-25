import { ethers } from "ethers";
import { getAAProvider } from "./providers/aa.js";
import { getRelayerWallet } from "./providers/relayer.js";

function txMode() {
  return process.env.TX_MODE ?? "relayer";
}

export async function getSignerForUser(userId: string) {
  if (txMode() === "aa") {
    return getAAProvider(userId);
  }
  return getRelayerWallet(userId);
}

export function rpc() {
  const url = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  return new ethers.JsonRpcProvider(url);
}
