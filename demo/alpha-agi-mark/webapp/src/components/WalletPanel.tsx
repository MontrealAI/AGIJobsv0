import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function WalletPanel() {
  return (
    <div style={{ marginTop: '1rem' }}>
      <ConnectButton chainStatus="icon" />
    </div>
  );
}
