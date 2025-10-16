import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';

export default function WalletConnect(): JSX.Element {
  const [account, setAccount] = useState<string>('');

  useEffect(() => {
    async function connect() {
      const { ethereum } = window as typeof window & { ethereum?: any };
      if (!ethereum) return;
      const [selected] = await ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(ethers.getAddress(selected));
    }
    void connect();
  }, []);

  return (
    <div className="wallet">
      <span>{account ? `Wallet: ${account}` : 'Connect a wallet to begin'}</span>
    </div>
  );
}
