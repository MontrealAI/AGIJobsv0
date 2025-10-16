import React from 'react';
import { createRoot } from 'react-dom/client';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import App from './App';
import './styles.css';
import { WagmiConfig, wagmiConfig, chains } from './lib/web3';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing root element');
}

createRoot(root).render(
  <React.StrictMode>
    <WagmiConfig config={wagmiConfig}>
      <RainbowKitProvider
        chains={chains}
        theme={darkTheme({ accentColor: '#40ffa8', borderRadius: 'large' })}
      >
        <App />
      </RainbowKitProvider>
    </WagmiConfig>
  </React.StrictMode>
);
