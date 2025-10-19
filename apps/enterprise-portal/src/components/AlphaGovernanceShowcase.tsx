'use client';

import { useMemo } from 'react';
import transcriptJson from '../../../../demo/agi-governance/export/latest.json';
import type { GovernanceTranscript, GovernanceTimelineEvent } from '../../../../demo/agi-governance/lib/transcript';
import SolvingGovernanceExperience from './SolvingGovernanceExperience';
import { LanguageSelector } from './LanguageSelector';

const transcript = transcriptJson as GovernanceTranscript;

function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercentage(value: number): string {
  return `${formatNumber(value * 100, 2)}%`;
}

function formatTimestamp(event: GovernanceTimelineEvent): string {
  try {
    const date = new Date(event.at);
    return date.toLocaleString();
  } catch (error) {
    return event.at;
  }
}

function MetricCard({
  title,
  subtitle,
  value,
  tag,
}: {
  title: string;
  subtitle: string;
  value: string;
  tag: string;
}) {
  return (
    <section>
      <div className="card-title">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <span className="tag purple">{tag}</span>
      </div>
      <div style={{ fontSize: '2.4rem', fontWeight: 700 }}>{value}</div>
    </section>
  );
}

function Timeline() {
  const events = useMemo(() => {
    return [...transcript.timeline].sort((a, b) =>
      a.at.localeCompare(b.at)
    );
  }, []);

  return (
    <section>
      <div className="card-title">
        <div>
          <h2>Mission timeline</h2>
          <p>
            Every action executed by the orchestration script. Use it as a
            runbook or audit trail.
          </p>
        </div>
        <span className="tag blue">Autonomous</span>
      </div>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {events.map((event) => (
          <li
            key={event.id}
            style={{
              padding: '0.75rem 0',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{event.label}</strong>
              <span style={{ opacity: 0.7 }}>{formatTimestamp(event)}</span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '0.35rem',
              color: '#8f97ac',
              fontSize: '0.85rem',
            }}>
              <span>
                {event.category.toUpperCase()} • {event.actor}
                {event.jobId ? ` • job #${event.jobId}` : ''}
              </span>
              {event.txHash && <span>{event.txHash.slice(0, 10)}…</span>}
            </div>
            {event.notes && (
              <p style={{ marginTop: '0.5rem' }}>{event.notes}</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function AlphaGovernanceShowcase() {
  const energy = transcript.energy;
  const metrics = transcript.metrics;
  const ownerActions = transcript.ownerActions;
  const jobs = transcript.jobs;

  return (
    <div className="grid two-column" style={{ gap: '2rem' }}>
      <section style={{ gridColumn: '1 / span 2' }}>
        <div className="card-title">
          <div>
            <h1>Solving α-AGI Governance — Command Center</h1>
            <p>
              A superintelligent-scale governance machine, assembled directly
              from AGI Jobs v0 (v2). Run the orchestration script, open this
              command center, and you are instantly managing multi-nation
              policies, validator swarms, Hamiltonian telemetry, and owner
              safeguards without touching raw RPC calls.
            </p>
          </div>
          <LanguageSelector />
        </div>
        <div className="data-grid">
          <div>
            <h4>Quick start</h4>
            <pre
              style={{
                background: 'rgba(12, 16, 26, 0.85)',
                padding: '1rem',
                borderRadius: '12px',
                fontSize: '0.9rem',
                lineHeight: 1.6,
              }}
            >
{`npm install
npm run compile
npm run demo:agi-governance:run`}
            </pre>
          </div>
          <div>
            <h4>Stakeholders</h4>
            <p>
              {jobs.length} sovereign missions • {transcript.validators.length}{' '}
              validators • $AGIALPHA treasury inflows {formatNumber(metrics.treasuryInflows)} •
              cooperation index {formatNumber(metrics.cooperationIndex)}
            </p>
            <p>
              Owner address {transcript.platform.owner} controls pause,
              quorum, windows, stake thresholds, Hamiltonian feedback.
            </p>
          </div>
        </div>
      </section>

      <MetricCard
        title="Gibbs free energy"
        subtitle="Macro energy still available for policy execution"
        value={`${formatNumber(energy.gibbsFreeEnergy)} ζ-AGIALPHA`}
        tag="Thermodynamics"
      />
      <MetricCard
        title="Hamiltonian curvature"
        subtitle="Dynamic incentive gradient after validator commitments"
        value={`${formatNumber(energy.hamiltonian, 3)} ΔH`
        }
        tag="Physics"
      />
      <MetricCard
        title="Antifragility"
        subtitle="Validator cooperation × thermodynamic slack"
        value={formatPercentage(energy.antifragilityScore)}
        tag="Game Theory"
      />
      <MetricCard
        title="Landauer proximity"
        subtitle="Scaled Landauer bound vs. current dissipation"
        value={`${formatNumber(energy.landauerBound, 4)} attJ`}
        tag="Information"
      />

      <section>
        <div className="card-title">
          <div>
            <h2>Owner command log</h2>
            <p>
              Every privileged move executed by the script. Use these as
              templates for Safe transactions or console runs.
            </p>
          </div>
          <span className="tag green">Sovereign control</span>
        </div>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ownerActions.map((action) => (
            <li
              key={action.id}
              style={{
                padding: '0.75rem 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{action.label}</strong>
                <span style={{ opacity: 0.7 }}>{action.at}</span>
              </div>
              <p style={{ marginTop: '0.5rem' }}>
                Before → After: {JSON.stringify(action.before)} →{' '}
                {JSON.stringify(action.after)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className="card-title">
          <div>
            <h2>Mission registry</h2>
            <p>
              Snapshot of every job finalised by the orchestration. Values
              come directly from the on-chain registry after settlement.
            </p>
          </div>
          <span className="tag teal">Live state</span>
        </div>
        <div className="data-grid">
          {jobs.map((job) => (
            <div key={job.id} style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(12, 16, 26, 0.85)' }}>
              <h3>{job.nationLabel}</h3>
              <p>{job.entropy.toFixed(2)} entropy • {job.dissipation.toFixed(2)} dissipation</p>
              <p>
                Reward {job.reward} $AGIALPHA • Approvals {job.approvals}/
                {job.validators}
              </p>
              <p>Agent {job.agent}</p>
              <p>Spec hash {job.specHash.slice(0, 10)}…</p>
            </div>
          ))}
        </div>
      </section>

      <Timeline />

      <section style={{ gridColumn: '1 / span 2' }}>
        <div className="card-title">
          <div>
            <h2>Interactive control room</h2>
            <p>
              The full Solving Governance cockpit is embedded below. Connect
              a wallet, execute new missions, tweak parameters, or run the
              validator console live against the contracts deployed by the
              orchestration.
            </p>
          </div>
          <span className="tag orange">Live ops</span>
        </div>
        <SolvingGovernanceExperience />
      </section>
    </div>
  );
}
