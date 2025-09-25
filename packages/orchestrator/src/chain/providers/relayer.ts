import { ethers } from "ethers";

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const provider = new ethers.JsonRpcProvider(rpcUrl);

export async function getRelayerWallet(_userId: string) {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (key) {
    return new ethers.Wallet(key, provider);
  }
  // For scaffolding we fallback to an ephemeral key so local development works.
  return ethers.Wallet.createRandom().connect(provider);
}
