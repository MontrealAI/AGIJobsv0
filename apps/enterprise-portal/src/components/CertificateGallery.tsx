'use client';

import { useEffect } from 'react';
import { useCertificates } from '../hooks/useCertificates';
import { useWeb3 } from '../context/Web3Context';
import { displayResourceUri, resolveResourceUri } from '../lib/uri';

const formatAddress = (value?: string): string => {
  if (!value || value === 'Unknown') return 'Unknown';
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const truncateValue = (
  value?: string,
  lead = 10,
  tail = 6
): string | undefined => {
  if (!value) return undefined;
  if (value.length <= lead + tail + 3) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
};

const formatCid = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
};

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
          <p>
            Agents receive NFTs documenting successful delivery, SLA compliance
            and signed result proofs. Each badge links to IPFS metadata and
            exposes signature verification against the on-chain result hash for
            employers and auditors.
          </p>
        </div>
        <div className="tag purple">NFT</div>
      </div>
      {loading && <div className="small">Loading certificates…</div>}
      {error && <div className="alert error">{error}</div>}
      <div className="badge-grid">
        {certificates.map((certificate) => {
          const metadataLink =
            certificate.metadataGatewayURI ??
            resolveResourceUri(certificate.metadataURI) ??
            certificate.metadataURI;
          const metadataLabel =
            displayResourceUri(certificate.metadataURI) ??
            certificate.metadataURI;
          const deliverableLink = certificate.deliverableUri
            ? resolveResourceUri(certificate.deliverableUri) ??
              certificate.deliverableUri
            : undefined;
          const deliverableLabel = certificate.deliverableUri
            ? displayResourceUri(certificate.deliverableUri) ??
              certificate.deliverableUri
            : undefined;
          const slaLink = certificate.slaUri
            ? resolveResourceUri(certificate.slaUri) ?? certificate.slaUri
            : undefined;
          const issuedAt = new Date(
            certificate.issuedAt * 1000
          ).toLocaleString();
          const metadataResultHashLabel = truncateValue(
            certificate.metadataResultHash ?? undefined
          );
          const normalizedHashLabel = truncateValue(
            certificate.verification?.normalizedHash
          );
          return (
            <div className="badge-card" key={certificate.tokenId.toString()}>
              <div className="card-title" style={{ marginBottom: '1rem' }}>
                <div>
                  <h4>
                    {certificate.metadataName ??
                      `Certificate #${certificate.tokenId.toString()}`}
                  </h4>
                  <div className="small">
                    Job #{certificate.jobId.toString()} • Agent{' '}
                    {formatAddress(certificate.agent)}
                  </div>
                </div>
                <div className="tag green">Finalized</div>
              </div>
              <p>
                {certificate.metadataDescription ?? certificate.description}
              </p>
              <div
                className="grid two-column"
                style={{ gap: '1.25rem', marginTop: '1rem' }}
              >
                <div>
                  <div className="stat-label">Issued</div>
                  <div>{issuedAt}</div>
                  <div className="small">
                    Employer: {formatAddress(certificate.employer)}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Result hash</div>
                  {certificate.resultHash ? (
                    <code title={certificate.resultHash}>
                      {truncateValue(certificate.resultHash)}
                    </code>
                  ) : (
                    <div className="small">No result hash recorded.</div>
                  )}
                  {certificate.metadataResultHash && (
                    <div
                      className="small"
                      title={certificate.metadataResultHash}
                    >
                      Metadata result hash: {metadataResultHashLabel}
                    </div>
                  )}
                  {certificate.hashMatchesOnChain === false && (
                    <div
                      className="alert warning"
                      style={{ marginTop: '0.5rem' }}
                    >
                      Metadata result hash differs from the on-chain value.
                    </div>
                  )}
                </div>
              </div>
              <div
                className="grid two-column"
                style={{ gap: '1.25rem', marginTop: '1rem' }}
              >
                <div>
                  <div className="stat-label">Metadata</div>
                  {metadataLink ? (
                    <a href={metadataLink} target="_blank" rel="noreferrer">
                      {metadataLabel ?? 'Open metadata'}
                    </a>
                  ) : (
                    <div className="small">Metadata URI unavailable.</div>
                  )}
                  {certificate.metadataCid && (
                    <div className="small">
                      CID: {formatCid(certificate.metadataCid)}
                    </div>
                  )}
                  {certificate.uriHash && (
                    <div className="small" title={certificate.uriHash}>
                      On-chain URI hash: {truncateValue(certificate.uriHash)}
                    </div>
                  )}
                  {certificate.metadataError && (
                    <div
                      className="alert warning"
                      style={{ marginTop: '0.5rem' }}
                    >
                      {certificate.metadataError}
                    </div>
                  )}
                </div>
                <div>
                  <div className="stat-label">Deliverable</div>
                  {deliverableLink ? (
                    <a href={deliverableLink} target="_blank" rel="noreferrer">
                      {deliverableLabel ?? 'Open deliverable'}
                    </a>
                  ) : (
                    <div className="small">Deliverable link not provided.</div>
                  )}
                  {certificate.deliverableCid && (
                    <div className="small">
                      CID: {formatCid(certificate.deliverableCid)}
                    </div>
                  )}
                </div>
              </div>
              <div
                className="grid two-column"
                style={{ gap: '1.25rem', marginTop: '1rem' }}
              >
                <div>
                  <div className="stat-label">Signature</div>
                  {certificate.signature ? (
                    <>
                      <code title={certificate.signature}>
                        {truncateValue(certificate.signature)}
                      </code>
                      {certificate.signatureVerified ? (
                        <div
                          className="tag green"
                          style={{
                            marginTop: '0.5rem',
                            display: 'inline-block',
                          }}
                        >
                          Signature verified
                        </div>
                      ) : certificate.verificationError ? (
                        <div
                          className="alert warning"
                          style={{ marginTop: '0.5rem' }}
                        >
                          {certificate.verificationError}
                        </div>
                      ) : (
                        <div className="small">
                          Signature present. Verification pending.
                        </div>
                      )}
                      {certificate.verificationMessage &&
                        certificate.signatureVerified && (
                          <div
                            className="small"
                            style={{ marginTop: '0.5rem' }}
                          >
                            {certificate.verificationMessage}
                          </div>
                        )}
                      {certificate.verification?.recoveredAddress && (
                        <div className="small">
                          Recovered signer:{' '}
                          {formatAddress(
                            certificate.verification.recoveredAddress
                          )}
                        </div>
                      )}
                      {normalizedHashLabel && (
                        <div
                          className="small"
                          title={certificate.verification?.normalizedHash}
                        >
                          Signed hash: {normalizedHashLabel}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="small">No signature found in metadata.</div>
                  )}
                </div>
                <div>
                  <div className="stat-label">SLA reference</div>
                  {certificate.slaUri ? (
                    <a href={slaLink} target="_blank" rel="noreferrer">
                      {displayResourceUri(certificate.slaUri) ??
                        certificate.slaUri}
                    </a>
                  ) : (
                    <div className="small">
                      No SLA URI recorded for this certificate.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {certificates.length === 0 && !loading && (
        <div className="small">
          Certificates will appear once jobs are finalized, validators approve
          the result, and the deliverable signature is recorded on IPFS.
        </div>
      )}
    </section>
  );
};
