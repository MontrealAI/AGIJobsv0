import { ethers } from "ethers";

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const provider = new ethers.JsonRpcProvider(rpcUrl);

export async function getAAProvider(_userId: string) {
  // Placeholder AA signer – replace with smart account SDK.
  return ethers.Wallet.createRandom().connect(provider);
}
