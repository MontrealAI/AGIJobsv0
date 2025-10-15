import { useMemo, useState } from 'react';
import rawReport from '../data/grand-demo-report.json';
import {
  DemoBalanceSnapshot,
  DemoSectionRecord,
  GrandDemoReport,
} from '../types';

const reportData = rawReport as GrandDemoReport;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 2) {
    return address;
  }
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

function SnapshotTable({ snapshot }: { snapshot: DemoBalanceSnapshot }) {
  return (
    <div className="demo-snapshot">
      <div className="demo-snapshot-header">
        <h4>{snapshot.label}</h4>
        {snapshot.notes && <p className="helper-text">{snapshot.notes}</p>}
      </div>
      <table className="demo-snapshot-table">
        <thead>
          <tr>
            <th scope="col">Participant</th>
            <th scope="col">Role</th>
            <th scope="col">Balance</th>
            <th scope="col">Address</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.entries.map((entry) => (
            <tr key={`${snapshot.id}-${entry.address}`}>
              <td>{entry.name}</td>
              <td>{entry.role ?? '—'}</td>
              <td>{entry.balance.formatted}</td>
              <td className="address-cell" title={entry.address}>
                {shortenAddress(entry.address)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ScenarioViewerProps {
  scenario: DemoSectionRecord | undefined;
}

function ScenarioViewer({ scenario }: ScenarioViewerProps) {
  if (!scenario) {
    return (
      <p className="helper-text" role="status">
        Select a scenario to review the sovereign labour market timeline.
      </p>
    );
  }

  return (
    <div className="demo-scenario-view">
      {scenario.outcome && (
        <p className="scenario-outcome" role="status">
          {scenario.outcome}
        </p>
      )}
      <ol className="demo-step-list">
        {scenario.steps.map((step, index) => (
          <li key={`${scenario.id}-step-${index}`} className="demo-step">
            <div className="demo-step-header">
              <span className="demo-step-index" aria-hidden="true">
                {index + 1}
              </span>
              <h4>{step.title}</h4>
            </div>
            <div className="demo-step-events">
              {step.events.map((event, eventIndex) => (
                <article
                  key={`${scenario.id}-step-${index}-event-${eventIndex}`}
                  className="demo-event-card"
                >
                  <h5>{event.label}</h5>
                  {event.details && <p>{event.details}</p>}
                  {event.metrics && (
                    <dl className="demo-metric-grid">
                      {Object.entries(event.metrics).map(([key, value]) => (
                        <div key={`${scenario.id}-${index}-${key}`}>
                          <dt>{key}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </article>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {scenario.snapshots.length > 0 && (
        <div className="demo-snapshot-grid">
          {scenario.snapshots.map((snapshot) => (
            <SnapshotTable key={snapshot.id} snapshot={snapshot} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GrandDemoPanel() {
  const report = reportData;
  const scenarios = useMemo(
    () => report.sections.filter((section) => section.kind === 'scenario'),
    [report.sections]
  );
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    scenarios[0]?.id ?? ''
  );
  const selectedScenario = useMemo(
    () => scenarios.find((section) => section.id === selectedScenarioId) ?? scenarios[0],
    [scenarios, selectedScenarioId]
  );

  const telemetry = report.telemetry;

  return (
    <div className="panel panel-wide grand-demo-panel">
      <header className="grand-demo-header">
        <div>
          <h2>AGI Jobs v2 – Sovereign Labour Market Grand Demo</h2>
          <p className="helper-text">
            Fully sovereign AI labour orchestration with nation-state employers,
            validator councils, dispute governance, and certificate minting –
            powered entirely by the production contracts in this repository.
          </p>
        </div>
        <div className="demo-meta-block">
          <dl>
            <div>
              <dt>Network</dt>
              <dd>
                {report.metadata.network.name} (chain ID {report.metadata.network.chainId})
              </dd>
            </div>
            <div>
              <dt>Generated</dt>
              <dd>{formatTimestamp(report.metadata.generatedAt)}</dd>
            </div>
            <div>
              <dt>Owner control</dt>
              <dd className="address-cell" title={report.owner.address}>
                {shortenAddress(report.owner.address)}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="grand-demo-overview">
        <h3>Mission ledger</h3>
        <div className="demo-token-stats">
          <div>
            <span className="stat-label">Token</span>
            <span className="stat-value">
              {report.token.symbol} · {report.token.decimals} decimals
            </span>
          </div>
          <div>
            <span className="stat-label">Initial supply</span>
            <span className="stat-value">{report.token.initialSupply.formatted}</span>
          </div>
          {telemetry && (
            <div>
              <span className="stat-label">Current burn</span>
              <span className="stat-value">{telemetry.totalBurned.formatted}</span>
            </div>
          )}
        </div>
        <p className="helper-text">
          Use <code>npm run demo:agi-labor-market:report</code> to regenerate this
          transcript with live wallet addresses and balances from your own
          simulation run.
        </p>
      </section>

      <section className="grand-demo-actors">
        <h3>Actors &amp; sovereign roles</h3>
        <div className="actor-grid">
          {report.actors.map((actor) => (
            <article key={actor.id} className="actor-card">
              <h4>{actor.name}</h4>
              <p className="actor-role">{actor.role}</p>
              <p className="address-cell" title={actor.address}>
                {shortenAddress(actor.address, 6)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="grand-demo-scenarios">
        <div className="scenario-header">
          <h3>Interactive scenarios</h3>
          <div className="scenario-tabs" role="tablist">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className={
                  selectedScenario?.id === scenario.id
                    ? 'scenario-tab active'
                    : 'scenario-tab'
                }
                onClick={() => setSelectedScenarioId(scenario.id)}
                role="tab"
                aria-selected={selectedScenario?.id === scenario.id}
              >
                {scenario.title}
              </button>
            ))}
          </div>
        </div>
        <ScenarioViewer scenario={selectedScenario} />
      </section>

      {telemetry && (
        <section className="grand-demo-telemetry">
          <h3>Owner telemetry console</h3>
          <div className="telemetry-grid">
            <div>
              <span className="stat-label">Jobs completed</span>
              <span className="stat-value">{telemetry.totalJobs}</span>
            </div>
            <div>
              <span className="stat-label">Protocol fee</span>
              <span className="stat-value">{telemetry.feePct}%</span>
            </div>
            <div>
              <span className="stat-label">Validator reward</span>
              <span className="stat-value">{telemetry.validatorRewardPct}%</span>
            </div>
            <div>
              <span className="stat-label">Pending fees</span>
              <span className="stat-value">{telemetry.feePoolPending.formatted}</span>
            </div>
            <div>
              <span className="stat-label">Agent stake</span>
              <span className="stat-value">{telemetry.totalAgentStake.formatted}</span>
            </div>
            <div>
              <span className="stat-label">Validator stake</span>
              <span className="stat-value">{telemetry.totalValidatorStake.formatted}</span>
            </div>
          </div>
          <div className="telemetry-subgrid">
            <div>
              <h4>Agent credentials</h4>
              {telemetry.certificates.length === 0 ? (
                <p className="helper-text">No credentials minted yet.</p>
              ) : (
                <ul>
                  {telemetry.certificates.map((cert) => (
                    <li key={cert.jobId}>
                      Job #{cert.jobId} → {shortenAddress(cert.owner, 6)}
                      {cert.uri && (
                        <span className="helper-text"> · {cert.uri}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4>Agent portfolios</h4>
              <ul>
                {telemetry.agentPortfolios.map((actor) => (
                  <li key={actor.id}>
                    <strong>{actor.name}</strong> — liquid {actor.liquid?.formatted}
                    , stake {actor.staked?.formatted}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Validator council</h4>
              <ul>
                {telemetry.validatorPortfolios.map((actor) => (
                  <li key={actor.id}>
                    <strong>{actor.name}</strong> — stake {actor.staked?.formatted}
                    , reputation {actor.reputation}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
