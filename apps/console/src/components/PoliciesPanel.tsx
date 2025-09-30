import { GovernanceSnapshot } from '../types';

interface PoliciesPanelProps {
  snapshot: GovernanceSnapshot | null;
  refreshing: boolean;
  onRefresh: () => void;
}

function formatLabel(value?: string) {
  return value ?? '—';
}

function formatAddress(value?: string) {
  if (!value) return '—';
  if (value === '0x0000000000000000000000000000000000000000') {
    return 'Burn (0x00…00)';
  }
  return value;
}

export function PoliciesPanel({ snapshot, refreshing, onRefresh }: PoliciesPanelProps) {
  const identityConfig = snapshot?.configs?.identity as
    | {
        agentRootNode?: string;
        clubRootNode?: string;
        agentMerkleRoot?: string;
        validatorMerkleRoot?: string;
      }
    | undefined;
  const identityOnChain = snapshot?.onChain.identityRegistry as
    | {
        agentRootNode?: string;
        clubRootNode?: string;
        agentMerkleRoot?: string;
        validatorMerkleRoot?: string;
      }
    | undefined;

  return (
    <div className="panel">
      <h2>Protocol Policies</h2>
      <p className="helper-text">
        Snapshot taken {snapshot ? new Date(snapshot.timestamp).toLocaleString() : '—'} · Chain ID {snapshot?.chainId ?? '—'}
      </p>
      <div className="actions-row">
        <button type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh Snapshot'}
        </button>
      </div>

      <section>
        <h3>Stake Manager</h3>
        <div className="stat-grid">
          <div className="stat-card">
            <h3>Minimum Stake</h3>
            <p>{formatLabel(snapshot?.onChain.stakeManager?.minStakeLabel)}</p>
          </div>
          <div className="stat-card">
            <h3>Fee %</h3>
            <p>{formatLabel(snapshot?.onChain.stakeManager?.feePctLabel)}</p>
          </div>
          <div className="stat-card">
            <h3>Burn %</h3>
            <p>{formatLabel(snapshot?.onChain.stakeManager?.burnPctLabel)}</p>
          </div>
          <div className="stat-card">
            <h3>Validator Reward %</h3>
            <p>{formatLabel(snapshot?.onChain.stakeManager?.validatorRewardPctLabel)}</p>
          </div>
          <div className="stat-card">
            <h3>Treasury</h3>
            <p>{formatAddress(snapshot?.onChain.stakeManager?.treasury)}</p>
          </div>
        </div>
      </section>

      <section>
        <h3>Job Registry</h3>
        <div className="stat-grid">
          <div className="stat-card">
            <h3>Job Stake</h3>
            <p>{formatLabel(snapshot?.onChain.jobRegistry?.jobStakeLabel)}</p>
          </div>
          <div className="stat-card">
            <h3>Max Reward</h3>
            <p>{formatLabel(snapshot?.onChain.jobRegistry?.maxJobRewardLabel)}</p>
          </div>
          <div className="stat-card">
            <h3>Max Duration</h3>
            <p>{formatLabel(snapshot?.onChain.jobRegistry?.maxJobDurationLabel)}</p>
          </div>
          <div className="stat-card">
            <h3>Fee %</h3>
            <p>{formatLabel(snapshot?.onChain.jobRegistry?.feePctLabel)}</p>
          </div>
          <div className="stat-card">
            <h3>Validator Reward %</h3>
            <p>{formatLabel(snapshot?.onChain.jobRegistry?.validatorRewardPctLabel)}</p>
          </div>
        </div>
      </section>

      <section>
        <h3>Fee Pool</h3>
        <div className="stat-grid">
          <div className="stat-card">
            <h3>Burn %</h3>
            <p>{formatLabel(snapshot?.onChain.feePool?.burnPctLabel)}</p>
          </div>
          <div className="stat-card">
            <h3>Treasury</h3>
            <p>{formatAddress(snapshot?.onChain.feePool?.treasury)}</p>
          </div>
        </div>
      </section>

      <section>
        <h3>Identity Roots</h3>
        <p className="helper-text">
          ENS roots and Merkle allowlists are sourced from the owner control configuration. Update the values via governance
          actions below.
        </p>
        <div className="stat-grid">
          <div className="stat-card">
            <h3>Agent Root</h3>
            <p>{formatLabel(identityConfig?.agentRootNode ?? identityOnChain?.agentRootNode)}</p>
          </div>
          <div className="stat-card">
            <h3>Validator Root</h3>
            <p>{formatLabel(identityConfig?.clubRootNode ?? identityOnChain?.clubRootNode)}</p>
          </div>
          <div className="stat-card">
            <h3>Agent Allowlist</h3>
            <p>{formatLabel(identityConfig?.agentMerkleRoot ?? identityOnChain?.agentMerkleRoot)}</p>
          </div>
          <div className="stat-card">
            <h3>Validator Allowlist</h3>
            <p>
              {formatLabel(
                identityConfig?.validatorMerkleRoot ?? identityOnChain?.validatorMerkleRoot
              )}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default PoliciesPanel;
