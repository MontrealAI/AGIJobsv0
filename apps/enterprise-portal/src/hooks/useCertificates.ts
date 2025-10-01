'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createReadOnlyProvider, getCertificateNFTContract } from '../lib/contracts';
import type { CertificateBadge } from '../types';

interface CertificateState {
  certificates: CertificateBadge[];
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
}

export const useCertificates = (owner?: string): CertificateState => {
  const provider = useMemo(() => createReadOnlyProvider(), []);
  const [certificates, setCertificates] = useState<CertificateBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!owner) {
      setCertificates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const contract = getCertificateNFTContract(provider);
      const balance = await contract.balanceOf(owner);
      const count = Number(balance);
      const badges: CertificateBadge[] = [];
      for (let i = 0; i < count; i += 1) {
        const tokenId = await contract.tokenOfOwnerByIndex(owner, i);
        const uri = await contract.tokenURI(tokenId);
        badges.push({
          tokenId: BigInt(tokenId),
          jobId: BigInt(0),
          metadataURI: uri,
          issuedAt: Date.now() / 1000,
          employer: 'Pending',
          agent: owner,
          description: 'Certificate metadata requires off-chain fetch'
        });
      }
      setCertificates(badges);
    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? 'Unable to load certificates');
    } finally {
      setLoading(false);
    }
  }, [owner, provider]);

  useEffect(() => {
    load().catch((err) => console.error(err));
  }, [load]);

  useEffect(() => {
    const contract = getCertificateNFTContract(provider);
    const handler = (to: string) => {
      if (!owner || to.toLowerCase() !== owner.toLowerCase()) return;
      load().catch((err) => console.error(err));
    };
    contract.on('CertificateMinted', handler);
    return () => {
      contract.off('CertificateMinted', handler);
    };
  }, [load, owner, provider]);

  return { certificates, loading, error, refresh: load };
};
