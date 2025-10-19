'use client';

import AlphaGovernanceShowcase from '../../components/AlphaGovernanceShowcase';
import { LanguageProvider } from '../../context/LanguageContext';
import { Web3Provider } from '../../context/Web3Context';

export default function AlphaGovernancePage() {
  return (
    <Web3Provider>
      <LanguageProvider>
        <main>
          <AlphaGovernanceShowcase />
        </main>
      </LanguageProvider>
    </Web3Provider>
  );
}
