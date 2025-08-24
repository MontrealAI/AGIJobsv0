const { ethers } = require('ethers');

class WalletManager {
  constructor(keys, provider) {
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

  get(address) {
    if (!address) return undefined;
    return this.wallets.get(address.toLowerCase());
  }

  list() {
    return Array.from(this.wallets.values()).map((w) => w.address);
  }
}

module.exports = WalletManager;
