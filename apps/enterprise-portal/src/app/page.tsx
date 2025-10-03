'use client';

import { Web3Provider } from '../context/Web3Context';
import { PortalPage } from '../components/PortalPage';
import { LanguageProvider } from '../context/LanguageContext';

export default function Page() {
  return (
    <Web3Provider>
      <LanguageProvider>
        <PortalPage />
      </LanguageProvider>
    </Web3Provider>
  );
}
