'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './OneBoxMissionPanel.module.css';
import { MermaidDiagram } from './MermaidDiagram';
import { readOneboxConfig, resolveOrchestratorBase } from '../lib/environment';
import { checkOrchestratorHealth } from '../lib/orchestratorHealth';

type OneBoxMissionPanelProps = {
  onPromptSelect?: (prompt: string) => void;
};

type OrchestratorHealth = 'checking' | 'ready' | 'error' | 'missing';

type ChecklistStatus = 'ready' | 'pending' | 'error' | 'checking';

const statusIcon: Record<ChecklistStatus, string> = {
  ready: '✅',
  pending: '⌛',
  error: '⚠️',
  checking: '…',
};

const statusLabel: Record<ChecklistStatus, string> = {
  ready: 'Ready',
  pending: 'Pending',
  error: 'Attention',
  checking: 'Checking',
};

const diagramDefinition = `
flowchart LR
    user["👤 Operator"] --> plan["/plan\nLLM orchestrator"]
    plan --> simulate["/simulate\nRisk + budget"]
    simulate --> confirm{Confirm?}
    confirm -- Yes --> execute["/execute\nRelayer signs tx"]
    execute --> chain[("Ethereum / L2")]
    execute --> storage[("IPFS / pinning")] 
    chain --> receipts["Receipts cache"]
    receipts --> finalise["Finalize + payout"]
`;

export function OneBoxMissionPanel({ onPromptSelect }: OneBoxMissionPanelProps) {
  const { orchestratorUrl, apiToken, explorerTxBase, ipfsGatewayBase } = useMemo(
    () => readOneboxConfig(),
    []
  );
  const orchestratorBase = useMemo(
    () => resolveOrchestratorBase(orchestratorUrl) ?? null,
    [orchestratorUrl]
  );

  const [health, setHealth] = useState<OrchestratorHealth>(
    orchestratorBase ? 'checking' : 'missing'
  );
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const runHealthCheck = useCallback(async () => {
    if (!orchestratorBase) {
      setHealth('missing');
      setHealthError(null);
      setLastChecked(null);
      return;
    }
    setHealth('checking');
    setHealthError(null);
    const result = await checkOrchestratorHealth({
      orchestratorBase,
      apiToken,
    });
    setLastChecked(Date.now());
    if (result.status === 'ready') {
      setHealth('ready');
      setHealthError(null);
      return;
    }
    if (result.status === 'missing') {
      setHealth('missing');
      setHealthError(null);
      setLastChecked(null);
      return;
    }
    setHealth('error');
    setHealthError(result.error);
  }, [apiToken, orchestratorBase]);

  useEffect(() => {
    void runHealthCheck();
  }, [runHealthCheck]);

  const formattedLastChecked = useMemo(() => {
    if (!lastChecked) {
      return 'Not yet checked';
    }
    return new Date(lastChecked).toLocaleTimeString();
  }, [lastChecked]);

  const checklist = useMemo(
    () => {
      const orchestratorStatus: ChecklistStatus =
        health === 'ready'
          ? 'ready'
          : health === 'checking'
          ? 'checking'
          : health === 'error'
          ? 'error'
          : 'pending';
      const apiTokenStatus: ChecklistStatus = apiToken ? 'ready' : 'pending';
      const explorerStatus: ChecklistStatus = explorerTxBase
        ? 'ready'
        : 'pending';
      const ipfsStatus: ChecklistStatus = ipfsGatewayBase
        ? 'ready'
        : 'pending';
      return [
        {
          id: 'orchestrator',
          label: 'Orchestrator',
          status: orchestratorStatus,
          detail: orchestratorBase ?? 'Configure NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL.',
        },
        {
          id: 'token',
          label: 'API token',
          status: apiTokenStatus,
          detail: apiToken ? 'Authentication configured.' : 'Set ONEBOX_API_TOKEN for protected deployments.',
        },
        {
          id: 'explorer',
          label: 'Explorer link',
          status: explorerStatus,
          detail: explorerTxBase
            ? `Using ${explorerTxBase}`
            : 'Optional. Configure NEXT_PUBLIC_ONEBOX_EXPLORER_TX_BASE to surface tx links.',
        },
        {
          id: 'ipfs',
          label: 'IPFS gateway',
          status: ipfsStatus,
          detail: ipfsGatewayBase
            ? `Using ${ipfsGatewayBase}`
            : 'Defaulting to ipfs.io/ipfs/ for artefact previews.',
        },
      ];
    },
    [apiToken, explorerTxBase, health, ipfsGatewayBase, orchestratorBase]
  );

  const handlePromptSelect = useCallback(
    (text: string) => {
      if (onPromptSelect) {
        onPromptSelect(text);
      }
    },
    [onPromptSelect]
  );

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <h1 className={styles.title}>AGI Jobs One‑Box 👁️✨</h1>
        <p className={styles.subtitle}>
          A single conversational surface that lets non-technical operators launch, simulate, and settle institution-grade labour missions on-chain.
        </p>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Launch readiness</h2>
          <p className={styles.sectionSubtitle}>
            Check these guardrails before dispatching funds. Last check: {formattedLastChecked}.
          </p>
        </div>
        <ul className={styles.checklist}>
          {checklist.map((item) => (
            <li key={item.id} className={styles.checklistItem}>
              <span className={styles.checklistIcon} aria-hidden="true">
                {statusIcon[item.status]}
              </span>
              <div className={styles.checklistCopy}>
                <span className={styles.checklistLabel}>{item.label}</span>
                <span className={styles.checklistDetail}>{item.detail}</span>
              </div>
              <span className={styles.checklistStatus}>{statusLabel[item.status]}</span>
            </li>
          ))}
        </ul>
        <div className={styles.checklistActions}>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => {
              void runHealthCheck();
            }}
          >
            Re-run diagnostics
          </button>
          {healthError ? (
            <span className={styles.healthError}>Last error: {healthError}</span>
          ) : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>One‑Box flow</h2>
          <p className={styles.sectionSubtitle}>
            The assistant plans, simulates, and executes on your behalf while preserving owner overrides and escrow safety.
          </p>
        </div>
        <MermaidDiagram
          definition={diagramDefinition}
          chartId="onebox-flow"
          ariaLabel="Lifecycle of a One-Box mission"
          className={styles.diagram}
        />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Operator playbook</h2>
          <p className={styles.sectionSubtitle}>
            Drop these straight into the chat to experience full-lifecycle automation.
          </p>
        </div>
        <div className={styles.promptGrid}>
          <button
            type="button"
            className={styles.promptCard}
            onClick={() =>
              handlePromptSelect(
                'Post a global research sprint recruiting 6 agents to synthesise 500 policy briefs. Offer 45 AGIALPHA, deadline 48 hours, validator review mandatory.'
              )
            }
          >
            <span className={styles.promptTitle}>Launch a research sprint</span>
            <span className={styles.promptCopy}>
              Complete with validators, escrow, and immutable mission specs.
            </span>
          </button>
          <button
            type="button"
            className={styles.promptCard}
            onClick={() =>
              handlePromptSelect(
                'Simulate a treasury reconciliation mission that resolves 2,500 ledger anomalies with milestone payouts totalling 60 AGIALPHA.'
              )
            }
          >
            <span className={styles.promptTitle}>Dry-run treasury ops</span>
            <span className={styles.promptCopy}>
              Preview fees, burns, and required balances before committing.
            </span>
          </button>
          <button
            type="button"
            className={styles.promptCard}
            onClick={() =>
              handlePromptSelect(
                'Finalize job 42 once validator attestations are present and release the escrow to the winning agent. Share the payout receipt.'
              )
            }
          >
            <span className={styles.promptTitle}>Finalize with receipts</span>
            <span className={styles.promptCopy}>
              Showcase unstoppable settlement with on-chain evidence links.
            </span>
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Owner command surface</h2>
          <p className={styles.sectionSubtitle}>
            Keep full strategic control while the assistant handles execution.
          </p>
        </div>
        <ul className={styles.ownerList}>
          <li>
            Pause instantly with <code>npm run owner:system-pause -- --pause</code> and resume when ready.
          </li>
          <li>
            Update protocol economics via <code>npm run owner:parameters</code> followed by <code>npm run owner:update-all</code>.
          </li>
          <li>
            Rotate relayer keys or governance signers with the <code>owner:rotate</code> toolkit to maintain operational hygiene.
          </li>
        </ul>
      </section>
    </aside>
  );
}
