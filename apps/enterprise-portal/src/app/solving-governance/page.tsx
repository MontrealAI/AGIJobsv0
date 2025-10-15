'use client';

import SolvingGovernanceExperience from '../../components/SolvingGovernanceExperience';
import { Web3Provider } from '../../context/Web3Context';
import { LanguageProvider } from '../../context/LanguageContext';

export default function SolvingGovernancePage() {
  return (
    <Web3Provider>
      <LanguageProvider>
        <main>
          <SolvingGovernanceExperience />
        </main>
      </LanguageProvider>
    </Web3Provider>
  );
}
