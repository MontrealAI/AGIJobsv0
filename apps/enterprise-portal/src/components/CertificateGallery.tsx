'use client';

import { useEffect } from 'react';
import { useCertificates } from '../hooks/useCertificates';
import { useWeb3 } from '../context/Web3Context';

export const CertificateGallery = () => {
  const { address } = useWeb3();
  const { certificates, loading, error, refresh } = useCertificates(address);

  useEffect(() => {
    if (address) {
      refresh().catch((err) => console.error(err));
    }
  }, [address, refresh]);

  return (
    <section>
      <div className="card-title">
        <div>
          <h2>Completion Certificates &amp; SLA Badges</h2>
          <p>Agents receive NFTs documenting successful delivery and SLA compliance for auditability and credentials.</p>
        </div>
        <div className="tag purple">NFT</div>
      </div>
      {loading && <div className="small">Loading certificates…</div>}
      {error && <div className="alert error">{error}</div>}
      <div className="badge-grid">
        {certificates.map((certificate) => (
          <div className="badge-card" key={certificate.tokenId.toString()}>
            <h4>Certificate #{certificate.tokenId.toString()}</h4>
            <p>Agent: {certificate.agent.slice(0, 6)}…{certificate.agent.slice(-4)}</p>
            <p>Metadata: <a href={certificate.metadataURI} target="_blank" rel="noreferrer">{certificate.metadataURI}</a></p>
            <p className="small">Issued: {new Date(certificate.issuedAt * 1000).toLocaleString()}</p>
          </div>
        ))}
      </div>
      {certificates.length === 0 && !loading && (
        <div className="small">Certificates will appear once jobs are finalized and SLA terms satisfied.</div>
      )}
    </section>
  );
};
