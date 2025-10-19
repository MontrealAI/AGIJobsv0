'use client';

import AgiGovernanceShowcase from '../../components/AgiGovernanceShowcase';
import { Web3Provider } from '../../context/Web3Context';
import { LanguageProvider } from '../../context/LanguageContext';

export default function AgiGovernancePage() {
  return (
    <Web3Provider>
      <LanguageProvider>
        <main>
          <AgiGovernanceShowcase />
        </main>
      </LanguageProvider>
    </Web3Provider>
  );
}
