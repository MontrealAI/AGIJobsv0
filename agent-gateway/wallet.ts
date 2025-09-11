import { ethers, Wallet, JsonRpcProvider } from 'ethers';

export default class WalletManager {
  private provider: JsonRpcProvider;
  private wallets: Map<string, Wallet>;

  constructor(keys: string, provider: JsonRpcProvider) {
    this.provider = provider;
    this.wallets = new Map();
    if (keys) {
      keys
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
        .forEach((key) => {
          const wallet = new ethers.Wallet(key, provider);
          this.wallets.set(wallet.address.toLowerCase(), wallet);
        });
    }
  }

  get(address?: string): Wallet | undefined {
    if (!address) return undefined;
    return this.wallets.get(address.toLowerCase());
  }

  list(): string[] {
    return Array.from(this.wallets.values()).map((w) => w.address);
  }
}
