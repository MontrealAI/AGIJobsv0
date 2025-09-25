import { ethers } from "ethers";

let cachedProvider: ethers.JsonRpcProvider | undefined;

export function rpc(): ethers.JsonRpcProvider {
  if (!cachedProvider) {
    const url = process.env.RPC_URL ?? "http://localhost:8545";
    cachedProvider = new ethers.JsonRpcProvider(url);
  }
  return cachedProvider;
}

export async function getSignerForUser(userId: string) {
  const provider = rpc();
  const keySeed = ethers.id(userId || "anon");
  const wallet = ethers.Wallet.createRandom({
    extraEntropy: ethers.getBytes(keySeed)
  });
  return wallet.connect(provider);
}
