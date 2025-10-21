'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './OneBoxMissionPanel.module.css';
import { MermaidDiagram } from './MermaidDiagram';
import { readOneboxConfig, resolveOrchestratorBase } from '../lib/environment';
import { checkOrchestratorHealth } from '../lib/orchestratorHealth';
import {
  buildOwnerTelemetryCards,
  type GovernanceSnapshotResponse,
} from '../lib/governanceSnapshot';

type OneBoxMissionPanelProps = {
  onPromptSelect?: (prompt: string) => void;
};

type OrchestratorHealth = 'checking' | 'ready' | 'error' | 'missing';

type ChecklistStatus = 'ready' | 'pending' | 'error' | 'checking';

type GovernanceStatus = 'missing' | 'loading' | 'ready' | 'error';

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

const joinPath = (base: string, path: string): string => {
  const normalisedBase = base.replace(/\/+$/, '');
  const normalisedPath = path.replace(/^\/+/, '');
  return `${normalisedBase}/${normalisedPath}`;
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
  const {
    orchestratorUrl,
    apiToken,
    explorerTxBase,
    ipfsGatewayBase,
    networkName,
    chainId,
    contracts,
  } = useMemo(() => readOneboxConfig(), []);
  const orchestratorBase = useMemo(
    () => resolveOrchestratorBase(orchestratorUrl) ?? null,
    [orchestratorUrl]
  );

  const [health, setHealth] = useState<OrchestratorHealth>(
    orchestratorBase ? 'checking' : 'missing'
  );
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [copiedContractId, setCopiedContractId] = useState<string | null>(null);
  const copyResetRef = useRef<number | null>(null);
  const governanceAbortRef = useRef<AbortController | null>(null);
  const [governanceStatus, setGovernanceStatus] = useState<GovernanceStatus>(
    orchestratorBase ? 'loading' : 'missing'
  );
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [governanceSnapshot, setGovernanceSnapshot] =
    useState<GovernanceSnapshotResponse | null>(null);

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

  useEffect(() => {
    return () => {
      if (copyResetRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(copyResetRef.current);
      }
      if (governanceAbortRef.current) {
        governanceAbortRef.current.abort();
        governanceAbortRef.current = null;
      }
    };
  }, []);

  const runGovernanceSnapshot = useCallback(async () => {
    if (!orchestratorBase) {
      setGovernanceStatus('missing');
      setGovernanceSnapshot(null);
      setGovernanceError(null);
      if (governanceAbortRef.current) {
        governanceAbortRef.current.abort();
        governanceAbortRef.current = null;
      }
      return;
    }

    if (governanceAbortRef.current) {
      governanceAbortRef.current.abort();
    }

    const controller = new AbortController();
    governanceAbortRef.current = controller;

    setGovernanceStatus('loading');
    setGovernanceError(null);

    try {
      const response = await fetch(joinPath(orchestratorBase, 'governance/snapshot'), {
        method: 'GET',
        headers: apiToken
          ? {
              Authorization: `Bearer ${apiToken}`,
              Accept: 'application/json',
            }
          : { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as GovernanceSnapshotResponse;
      setGovernanceSnapshot(data);
      setGovernanceStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setGovernanceStatus('error');
      setGovernanceError(
        error instanceof Error
          ? error.message
          : 'Unable to load governance snapshot.'
      );
    } finally {
      if (governanceAbortRef.current === controller) {
        governanceAbortRef.current = null;
      }
    }
  }, [apiToken, orchestratorBase]);

  useEffect(() => {
    void runGovernanceSnapshot();
  }, [runGovernanceSnapshot]);

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

  const networkSummary = useMemo(() => {
    const parts: string[] = [];
    if (networkName) {
      parts.push(networkName);
    }
    if (chainId) {
      parts.push(`Chain ID ${chainId}`);
    }
    return parts.join(' • ');
  }, [chainId, networkName]);

  const contractEntries = useMemo(
    () => (contracts ?? []).filter((entry) => entry.address.length > 0),
    [contracts]
  );

  const ownerTelemetryCards = useMemo(
    () => buildOwnerTelemetryCards(governanceSnapshot),
    [governanceSnapshot]
  );

  const ownerSnapshotTime = useMemo(() => {
    if (!governanceSnapshot?.timestamp) {
      return null;
    }
    const parsed = new Date(governanceSnapshot.timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return governanceSnapshot.timestamp;
    }
    return parsed.toLocaleString();
  }, [governanceSnapshot?.timestamp]);

  const ownerSnapshotChain = useMemo(() => {
    if (governanceSnapshot?.chainId === undefined) {
      return null;
    }
    return typeof governanceSnapshot.chainId === 'number'
      ? `Chain ID ${governanceSnapshot.chainId}`
      : governanceSnapshot.chainId;
  }, [governanceSnapshot?.chainId]);

  const handleCopyAddress = useCallback(async (id: string, address: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = address;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedContractId(id);
      if (copyResetRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(copyResetRef.current);
      }
      if (typeof window !== 'undefined') {
        copyResetRef.current = window.setTimeout(() => {
          setCopiedContractId(null);
          copyResetRef.current = null;
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to copy address', error);
    }
  }, []);

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

      {(networkSummary || contractEntries.length > 0) && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Live contract map</h2>
            <p className={styles.sectionSubtitle}>
              Verify the deployment footprint before dispatching capital. All endpoints remain owner-governed.
            </p>
          </div>
          {networkSummary ? (
            <div className={styles.networkSummary}>
              <span className={styles.networkBadge}>Network</span>
              <span>{networkSummary}</span>
            </div>
          ) : null}
          {contractEntries.length > 0 ? (
            <ul className={styles.contractList}>
              {contractEntries.map((entry) => (
                <li key={entry.id} className={styles.contractItem}>
                  <div className={styles.contractHeader}>
                    <span className={styles.contractLabel}>{entry.label}</span>
                    <button
                      type="button"
                      className={styles.copyButton}
                      onClick={() => {
                        void handleCopyAddress(entry.id, entry.address);
                      }}
                    >
                      {copiedContractId === entry.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <code className={styles.contractAddress}>{entry.address}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.contractEmpty}>
              Provide contract addresses through deployment-config/oneclick.env or NEXT_PUBLIC overrides to surface the full map.
            </p>
          )}
        </section>
      )}

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
          <h2 className={styles.sectionTitle}>Owner telemetry</h2>
          <p className={styles.sectionSubtitle}>
            Live governance snapshot confirming that owner-controlled guardrails remain active.
          </p>
        </div>
        <div className={styles.ownerSnapshotMeta}>
          <div className={styles.ownerSnapshotSummary}>
            <span>Last snapshot: {ownerSnapshotTime ?? 'Not yet collected'}</span>
            {ownerSnapshotChain ? <span>{ownerSnapshotChain}</span> : null}
          </div>
          {orchestratorBase ? (
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => {
                void runGovernanceSnapshot();
              }}
            >
              Refresh owner metrics
            </button>
          ) : null}
        </div>
        {governanceStatus === 'loading' ? (
          <p className={styles.ownerTelemetryHint}>
            Collecting governance metrics from the orchestrator…
          </p>
        ) : null}
        {governanceStatus === 'error' ? (
          <p className={styles.ownerTelemetryError} role="alert">
            ⚠️ {governanceError ?? 'Unable to load governance snapshot.'}
          </p>
        ) : null}
        {governanceStatus === 'ready' && ownerTelemetryCards.length > 0 ? (
          <div className={styles.ownerTelemetryGrid}>
            {ownerTelemetryCards.map((card) => (
              <article key={card.id} className={styles.ownerTelemetryCard}>
                <h3 className={styles.ownerTelemetryTitle}>{card.title}</h3>
                {card.caption ? (
                  <p className={styles.ownerTelemetryCaption}>{card.caption}</p>
                ) : null}
                <dl className={styles.ownerTelemetryMetrics}>
                  {card.metrics.map((metric) => (
                    <div
                      key={`${card.id}-${metric.label}`}
                      className={styles.ownerTelemetryMetric}
                    >
                      <dt>{metric.label}</dt>
                      <dd>{metric.value}</dd>
                    </div>
                  ))}
                </dl>
                {card.footnote ? (
                  <p className={styles.ownerTelemetryFootnote}>{card.footnote}</p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
        {governanceStatus === 'ready' && ownerTelemetryCards.length === 0 ? (
          <p className={styles.ownerTelemetryHint}>
            Snapshot available but no owner policy metrics were published. Confirm governance tooling is configured.
          </p>
        ) : null}
        {governanceStatus === 'missing' ? (
          <p className={styles.ownerTelemetryHint}>
            Configure the orchestrator URL and API token to surface live owner controls.
          </p>
        ) : null}
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
