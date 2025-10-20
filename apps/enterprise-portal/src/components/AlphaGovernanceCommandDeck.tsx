'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Script from 'next/script';

import missionConfig from '../../../../demo/agi-governance/config/mission@v2.json';
import { useWeb3 } from '../context/Web3Context';
import SolvingGovernanceExperience from './SolvingGovernanceExperience';

type MissionConfig = typeof missionConfig;

type Action = {
  id: string;
  label: string;
  description: string;
  command: string;
};

declare global {
  interface Window {
    mermaid?: {
      initialize: (options: Record<string, unknown>) => void;
      render: (
        id: string,
        definition: string,
      ) => Promise<{ svg: string; bindFunctions?: (element: Element) => void }>;
    };
  }
}

const STORAGE_CHECKLIST = 'command-deck.checklist.v1';
const STORAGE_TIMELINE = 'command-deck.timeline.v1';
const isBrowser = typeof window !== 'undefined';

const ACTIONS: Action[] = [
  {
    id: 'generate-dossier',
    label: 'Generate Hamiltonian dossier',
    description: 'Runs npm run demo:agi-governance:iconic to emit Markdown, JSON, and HTML artefacts.',
    command: 'npm run demo:agi-governance:iconic',
  },
  {
    id: 'ci-guard',
    label: 'Verify CI guardrails',
    description: 'Confirms v2 CI workflow enforces Solving α-AGI Governance checks.',
    command: 'npm run demo:agi-governance:iconic:ci',
  },
  {
    id: 'owner-diagnostics',
    label: 'Run owner diagnostics',
    description: 'Aggregates pause, upgrade, treasury, and antifragility readiness.',
    command: 'npm run demo:agi-governance:iconic:owner',
  },
  {
    id: 'launch-ui',
    label: 'Launch Command Deck UI',
    description: 'Starts the Enterprise Portal and opens /agi-governance/command-deck.',
    command: 'npm run dev --prefix apps/enterprise-portal',
  },
  {
    id: 'validator-commit',
    label: 'Validator commit phase',
    description: 'Validators commit to mission results using antifragile salts.',
    command: 'Use Validator Commit card in Command Deck',
  },
  {
    id: 'validator-reveal',
    label: 'Validator reveal phase',
    description: 'Reveal commitments and compare burn evidence.',
    command: 'Use Reveal Validation card in Command Deck',
  },
  {
    id: 'finalize',
    label: 'Finalize α-field mission',
    description: 'Calls finalize once quorum reached and antifragility tests pass.',
    command: 'Finalize Job button in Command Deck',
  },
  {
    id: 'owner-drill',
    label: 'Owner emergency drill',
    description: 'Pause, queue upgrade, resume – verifying timelock enforcement.',
    command: 'Use Owner Command panel',
  },
];

const TIMELINE_MARKERS = [
  {
    id: 'charter',
    title: 'Thermodynamic Charter Uploaded',
    summary: 'mission@v2.json defines enthalpy, entropy, and antifragility tensors.',
  },
  {
    id: 'dossier',
    title: 'Command Deck Dossier Generated',
    summary: 'Markdown, HTML, and JSON dossiers minted from Hamiltonian analytics.',
  },
  {
    id: 'ci',
    title: 'CI Shield Verified',
    summary: 'Branch protections and workflow guardians confirmed at v2 strictness.',
  },
  {
    id: 'owner',
    title: 'Owner Diagnostics Cleared',
    summary: 'Pause/unpause, upgrade queue, treasury flows validated for readiness.',
  },
  {
    id: 'validators',
    title: 'Validator Symphony Executed',
    summary: 'Commit–reveal cycle completes with antifragile welfare gain.',
  },
  {
    id: 'mission-complete',
    title: 'Mission Finalized',
    summary: 'α-field convergence reached; reports archived and signed.',
  },
] as const;

type ChecklistState = Set<string>;

function loadChecklist(): ChecklistState {
  if (!isBrowser) {
    return new Set<string>();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_CHECKLIST);
    if (!raw) {
      return new Set<string>();
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
    }
  } catch (error) {
    console.warn('Failed to parse checklist state', error);
  }
  return new Set<string>();
}

function persistChecklist(state: ChecklistState): void {
  if (!isBrowser) {
    return;
  }
  const entries = Array.from(state.values());
  window.localStorage.setItem(STORAGE_CHECKLIST, JSON.stringify(entries));
}

function loadTimeline(): ChecklistState {
  if (!isBrowser) {
    return new Set<string>();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_TIMELINE);
    if (!raw) {
      return new Set<string>();
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
    }
  } catch (error) {
    console.warn('Failed to parse timeline state', error);
  }
  return new Set<string>();
}

function persistTimeline(state: ChecklistState): void {
  if (!isBrowser) {
    return;
  }
  const entries = Array.from(state.values());
  window.localStorage.setItem(STORAGE_TIMELINE, JSON.stringify(entries));
}

function formatNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function formatPercent(value: number, digits = 1): string {
  return `${formatNumber(value * 100, digits)}%`;
}

const mermaidDefinition = `graph LR\n  charter[mission@v2.json uploaded]:::start --> dossier[Command Deck dossier generated]:::node\n  dossier --> ci[CI shield verified]:::node\n  ci --> owner[Owner diagnostics passed]:::node\n  owner --> validators[Validator symphony executed]:::node\n  validators --> antifragile[Antifragile shock improves welfare]:::node\n  antifragile --> finalize[Mission finalized & archived]:::success\n  classDef start fill:#1d4ed8,stroke:#93c5fd,color:#e0f2fe,stroke-width:3px;\n  classDef node fill:#111827,stroke:#6366f1,color:#e0e7ff,stroke-width:2px;\n  classDef success fill:#022c22,stroke:#34d399,color:#d1fae5,stroke-width:3px;`;

export default function AlphaGovernanceCommandDeck(): JSX.Element {
  const { address, connect, disconnect } = useWeb3();
  const [checklist, setChecklist] = useState<ChecklistState>(() => loadChecklist());
  const [timeline, setTimeline] = useState<ChecklistState>(() => loadTimeline());
  const [mermaidReady, setMermaidReady] = useState(false);
  const [mermaidSvg, setMermaidSvg] = useState<string>();

  useEffect(() => {
    persistChecklist(checklist);
  }, [checklist]);

  useEffect(() => {
    persistTimeline(timeline);
  }, [timeline]);

  useEffect(() => {
    if (!mermaidReady) {
      return;
    }
    const mermaid = window.mermaid;
    if (!mermaid) {
      return;
    }
    void mermaid
      .render('commandDeckFlow', mermaidDefinition)
      .then(({ svg, bindFunctions }) => {
        setMermaidSvg(svg);
        if (bindFunctions) {
          const container = document.getElementById('command-deck-mermaid');
          if (container) {
            bindFunctions(container);
          }
        }
      })
      .catch((error) => {
        console.error('Failed to render mermaid diagram', error);
      });
  }, [mermaidReady]);

  const toggleAction = useCallback((id: string) => {
    setChecklist((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setTimeline((current) => {
      if (!TIMELINE_MARKERS.some((marker) => marker.id === id)) {
        return current;
      }
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const completionRate = useMemo(() => checklist.size / ACTIONS.length, [checklist]);

  const mission = missionConfig as MissionConfig;

  const emission = mission.incentives.mintRule;
  const antifragility = mission.antifragility;
  const alpha = mission.alphaField;
  const risk = mission.risk;
  const energyLevels = mission.statisticalPhysics.energyLevels;
  const totalDegeneracy = useMemo(
    () => energyLevels.reduce((accumulator, item) => accumulator + item.degeneracy, 0),
    [energyLevels],
  );

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.mermaid) {
            window.mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
            setMermaidReady(true);
          }
        }}
      />
      <section style={{ marginBottom: '2rem' }}>
        <div className="card-title">
          <div>
            <h1>Solving α-AGI Governance Command Deck</h1>
            <p>
              Mission charter <strong>{mission.meta.version}</strong> · Gibbs energy target locked at
              {` ${formatNumber(mission.thermodynamics.enthalpyKJ, 0)} kJ`} with
              {` ${formatNumber(mission.thermodynamics.bitsProcessed / 1e9, 2)} billion`} bits processed.
            </p>
          </div>
          <div>
            {address ? (
              <button className="secondary" onClick={disconnect} type="button">
                Disconnect {address.slice(0, 6)}…{address.slice(-4)}
              </button>
            ) : (
              <button className="primary" onClick={connect} type="button">
                Connect Owner Wallet
              </button>
            )}
          </div>
        </div>
        <div className="data-grid">
          <div>
            <strong>Emission η</strong>
            <p>{formatPercent(emission.eta)}</p>
          </div>
          <div>
            <strong>Treasury mirror share</strong>
            <p>{formatPercent(emission.treasuryMirrorShare)}</p>
          </div>
          <div>
            <strong>Antifragility σ samples</strong>
            <p>{antifragility.sigmaSamples.map((value) => formatNumber(value, 2)).join(' · ')}</p>
          </div>
          <div>
            <strong>α-field energy floor</strong>
            <p>{formatNumber(alpha.verification.energyMarginFloorKJ)} kJ</p>
          </div>
          <div>
            <strong>Risk portfolio threshold</strong>
            <p>{formatNumber(risk.portfolioThreshold, 2)}</p>
          </div>
          <div>
            <strong>Checklist completion</strong>
            <p>{formatPercent(completionRate)}</p>
          </div>
        </div>
      </section>

      <div className="grid two-column" style={{ marginBottom: '2rem' }}>
        <section>
          <div className="card-title">
            <h2>Validator Symphony Checklist</h2>
            <span className="tag green">Antifragile</span>
          </div>
          <p>
            Track each mission milestone. Completed steps feed the timeline and persist between sessions so the command deck can
            resume instantly.
          </p>
          <div className="badge-grid">
            {ACTIONS.map((action) => {
              const done = checklist.has(action.id);
              return (
                <div key={action.id} className="badge-card" style={{ border: done ? '1px solid #22c55e' : undefined }}>
                  <div className="card-title" style={{ marginBottom: '0.5rem' }}>
                    <h3>{action.label}</h3>
                    <span className={`tag ${done ? 'green' : 'orange'}`}>{done ? 'Done' : 'Pending'}</span>
                  </div>
                  <p>{action.description}</p>
                  <code style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.85rem' }}>{action.command}</code>
                  <button
                    className={done ? 'secondary' : 'primary'}
                    onClick={() => toggleAction(action.id)}
                    style={{ marginTop: '0.75rem', width: '100%' }}
                    type="button"
                  >
                    {done ? 'Mark as pending' : 'Mark as complete'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
        <section>
          <div className="card-title">
            <h2>Energy Levels & Reward Curve</h2>
            <span className="tag purple">Hamiltonian</span>
          </div>
          <p>Statistical energy states used to derive the Gibbs free-energy profile.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Energy (kJ)</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Degeneracy</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {energyLevels.map((level, index) => {
                const share = totalDegeneracy > 0 ? level.degeneracy / totalDegeneracy : 0;
                return (
                  <tr key={`${level.energy}-${index}`} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <td style={{ padding: '0.5rem' }}>{formatNumber(level.energy, 0)}</td>
                    <td style={{ padding: '0.5rem' }}>{level.degeneracy}</td>
                    <td style={{ padding: '0.5rem' }}>{formatPercent(share)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: '1.25rem' }}>
            <strong>Reward engine shares</strong>
            <ul>
              {emission.rewardEngineShares.map((share) => (
                <li key={share.role}>
                  {share.role}: {formatPercent(share.share)}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section style={{ marginBottom: '2rem' }}>
        <div className="card-title">
          <h2>Antifragility & Risk Guardrails</h2>
          <span className="tag teal">Game theory</span>
        </div>
        <p>
          Inject controlled σ perturbations to ensure welfare increases. Residual risk must remain below the portfolio threshold
          with staking and formal proofs delivering >{formatPercent(alpha.verification.ownerCoverageMinimum)} owner coverage.
        </p>
        <div className="data-grid">
          <div>
            <strong>σ reward multiplier</strong>
            <p>{formatNumber(antifragility.sigmaRewardMultiplier)}</p>
          </div>
          <div>
            <strong>Divergence penalty</strong>
            <p>{formatNumber(antifragility.divergencePenalty, 3)}</p>
          </div>
          <div>
            <strong>Curvature boost</strong>
            <p>{formatNumber(antifragility.curvatureBoost)}</p>
          </div>
          <div>
            <strong>Superintelligence minimum</strong>
            <p>{formatPercent(alpha.verification.superintelligenceMinimum)}</p>
          </div>
          <div>
            <strong>Quantum confidence minimum</strong>
            <p>{formatPercent(alpha.verification.quantumConfidenceMinimum)}</p>
          </div>
        </div>
        <div className="timeline">
          {TIMELINE_MARKERS.map((marker) => {
            const achieved = timeline.has(marker.id) || checklist.has(marker.id);
            return (
              <div key={marker.id} className="timeline-item">
                <h3>
                  {marker.title}{' '}
                  <span className={`tag ${achieved ? 'green' : 'orange'}`}>{achieved ? 'Captured' : 'Awaiting'}</span>
                </h3>
                <p>{marker.summary}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <div className="card-title">
          <h2>Mission Flow</h2>
          <span className="tag blue">Mermaid</span>
        </div>
        <div
          id="command-deck-mermaid"
          dangerouslySetInnerHTML={{ __html: mermaidSvg ?? '<pre>Loading mermaid flow…</pre>' }}
          style={{ overflowX: 'auto' }}
        />
      </section>

      <section>
        <div className="card-title">
          <h2>Interactive Command Deck</h2>
          <span className="tag red">On-chain</span>
        </div>
        <p>
          Execute every action directly against the deployed protocol. The panel below wraps the existing Solving α-AGI
          Governance cockpit with mission@v2 presets, antifragile validator storage, and owner safeguards.
        </p>
        <SolvingGovernanceExperience />
      </section>
    </>
  );
}
