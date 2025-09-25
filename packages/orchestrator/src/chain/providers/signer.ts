import { ethers } from "ethers";

const derivationBasePath = "m/44'/60'/0'/0";

function getAccountIndex(userId: string) {
  const hash = BigInt(ethers.id(userId));
  const maxIndex = BigInt(0x80000000); // 2**31
  return Number(hash % maxIndex);
}

export function deterministicWalletFromMnemonic(
  mnemonic: string,
  userId: string,
  provider: ethers.Provider,
) {
  const index = getAccountIndex(userId);
  const path = `${derivationBasePath}/${index}`;
  const derived = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  return new ethers.Wallet(derived.privateKey, provider);
}
