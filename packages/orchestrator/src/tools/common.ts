import { ethers } from "ethers";

export async function pinToIpfs(payload: unknown): Promise<string> {
  // Placeholder – integrate with IPFS or web3.storage in production.
  const serialized = JSON.stringify(payload);
  const digest = ethers.id(serialized).slice(2, 10);
  return `ipfs://stub-${digest}`;
}

export function toWei(amount: string | number | bigint): bigint {
  if (typeof amount === "bigint") {
    return amount;
  }
  const value = typeof amount === "number" ? amount.toString() : amount;
  return ethers.parseUnits(value, 18);
}

export type Yieldable = AsyncGenerator<string, void, unknown>;

export async function* withSimulation<T>(
  step: string,
  runner: () => Promise<T>
): Yieldable {
  try {
    yield `${step}\n`;
    await runner();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    yield `❌ ${message}\n`;
    throw error;
  }
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `❌ ${error.message}\n`;
  }
  return "❌ Unknown error\n";
}
