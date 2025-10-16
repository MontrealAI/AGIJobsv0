import React from 'react';
import WalletConnect from './components/WalletConnect';
import ChatCreateMarket from './components/ChatCreateMarket';
import MarketsTable from './components/MarketsTable';
import ValidatePanel from './components/ValidatePanel';
import OwnerPanel from './components/OwnerPanel';

export default function App(): JSX.Element {
  return (
    <div className="container">
      <header>
        <h1>α-AGI MARK 🔮🌌✨</h1>
        <p>Foresight DEX & Risk Oracle powered by AGI Jobs v0 (v2)</p>
        <WalletConnect />
      </header>

      <section>
        <h2>Create Market</h2>
        <ChatCreateMarket />
      </section>

      <section>
        <h2>Open Markets</h2>
        <MarketsTable />
      </section>

      <section>
        <h2>Validate</h2>
        <ValidatePanel />
      </section>

      <section>
        <h2>Owner Controls</h2>
        <OwnerPanel />
      </section>
    </div>
  );
}
