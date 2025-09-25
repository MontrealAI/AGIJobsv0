import { ethers } from "ethers";

export async function pinToIpfs(payload: unknown): Promise<string> {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `ipfs://stub-${encoded.slice(0, 10)}`;
}

export function toWei(amount: string | number): bigint {
  const numeric = typeof amount === "number" ? amount.toString() : amount;
  try {
    return ethers.parseUnits(numeric, 18);
  } catch {
    return 0n;
  }
}

export function formatAGIA(amount: string | number | undefined): string {
  if (amount === undefined) return "0";
  return typeof amount === "number" ? amount.toString() : amount;
}
