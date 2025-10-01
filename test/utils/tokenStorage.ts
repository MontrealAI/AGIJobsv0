import { ethers, network } from 'hardhat';

function formatSlot(slot: number | bigint | string): string {
  if (typeof slot === 'string') {
    const trimmed = slot.startsWith('0x') ? slot : `0x${slot}`;
    return ethers.zeroPadValue(trimmed, 32);
  }
  const value = typeof slot === 'number' ? BigInt(slot) : slot;
  return ethers.zeroPadValue(ethers.toBeHex(value), 32);
}

export async function setErc20Balance(
  tokenAddress: string,
  account: string,
  amount: bigint,
  slot: number | bigint | string = 0
): Promise<void> {
  const storageSlot = formatSlot(slot);
  const index = ethers.solidityPackedKeccak256(
    ['bytes32', 'bytes32'],
    [ethers.zeroPadValue(account, 32), storageSlot]
  );
  const value = ethers.zeroPadValue(ethers.toBeHex(amount), 32);
  await network.provider.send('hardhat_setStorageAt', [
    tokenAddress,
    index,
    value,
  ]);
}

export async function setUintStorage(
  contractAddress: string,
  slot: number | bigint | string,
  value: bigint
): Promise<void> {
  const targetSlot = formatSlot(slot);
  const encoded = ethers.zeroPadValue(ethers.toBeHex(value), 32);
  await network.provider.send('hardhat_setStorageAt', [
    contractAddress,
    targetSlot,
    encoded,
  ]);
}
