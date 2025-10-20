'use client';

import AlphaGovernanceCommandDeck from '../../../components/AlphaGovernanceCommandDeck';
import { LanguageProvider } from '../../../context/LanguageContext';
import { Web3Provider } from '../../../context/Web3Context';

export default function CommandDeckPage(): JSX.Element {
  return (
    <Web3Provider>
      <LanguageProvider>
        <main>
          <AlphaGovernanceCommandDeck />
        </main>
      </LanguageProvider>
    </Web3Provider>
  );
}
