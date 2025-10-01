'use client';

import { Web3Provider } from '../context/Web3Context';
import { PortalPage } from '../components/PortalPage';

export default function Page() {
  return (
    <Web3Provider>
      <PortalPage />
    </Web3Provider>
  );
}
