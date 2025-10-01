'use client';

import { useState } from 'react';
import { getTaxPolicyContract } from '../lib/contracts';
import { useWeb3 } from '../context/Web3Context';

export const ConnectionPanel = () => {
  const { address, chainId, connect, disconnect, hasAcknowledged, acknowledgementVersion, loadingAck, signer, refreshAcknowledgement } =
    useWeb3();
  const [acknowledging, setAcknowledging] = useState(false);
  const [ackMessage, setAckMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const handleConnect = async () => {
    try {
      await connect();
      setError(undefined);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setAckMessage(undefined);
    setError(undefined);
  };

  const acknowledgePolicy = async () => {
    if (!signer) return;
    setAcknowledging(true);
    setError(undefined);
    try {
      const contract = getTaxPolicyContract(signer);
      const tx = await contract.acknowledge();
      await tx.wait?.();
      const message = await contract.acknowledgement?.();
      setAckMessage(message ?? 'Acknowledgement recorded');
      await refreshAcknowledgement();
    } catch (err) {
      setError((err as Error).message ?? 'Unable to acknowledge policy');
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <section>
      <div className="card-title">
        <div>
          <h2>Enterprise Identity</h2>
          <p>Connect a verified treasury wallet to manage AGI job postings and acknowledgements.</p>
        </div>
        <div className={`tag ${address ? 'green' : 'purple'}`}>{address ? 'Connected' : 'Not connected'}</div>
      </div>
      <div className="data-grid">
        <div>
          <div className="stat-label">Employer Address</div>
          <div className="stat-value">{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—'}</div>
        </div>
        <div>
          <div className="stat-label">Active Network</div>
          <div className="stat-value">{chainId ? `Chain ${chainId}` : 'Unknown'}</div>
        </div>
        <div>
          <div className="stat-label">Tax Policy</div>
          <div className="stat-value">
            {loadingAck ? 'Checking…' : hasAcknowledged ? `Accepted v${acknowledgementVersion?.toString() ?? 'current'}` : 'Pending acceptance'}
          </div>
        </div>
      </div>
      <div className="inline-actions" style={{ marginTop: '1.5rem' }}>
        {address ? (
          <button className="secondary" onClick={handleDisconnect} type="button">
            Disconnect
          </button>
        ) : (
          <button className="primary" onClick={handleConnect} type="button">
            Connect Wallet
          </button>
        )}
        <button
          className="secondary"
          type="button"
          onClick={acknowledgePolicy}
          disabled={!address || acknowledging || loadingAck || hasAcknowledged}
        >
          {acknowledging ? 'Awaiting signature…' : hasAcknowledged ? 'Policy accepted' : 'Accept latest tax policy'}
        </button>
      </div>
      {ackMessage && <div className="alert success">{ackMessage}</div>}
      {error && <div className="alert error">{error}</div>}
      <p className="small" style={{ marginTop: '1rem' }}>
        Verified organisations must acknowledge the latest on-chain tax policy before creating high-value jobs. The portal auto-
        checks this requirement and guides signers through the acknowledgement transaction when necessary.
      </p>
    </section>
  );
};
