'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import MermaidDiagram from './MermaidDiagram';
import summaryData from '../../../../demo/agi-governance/reports/governance-demo-summary.json';

type RawSummary = typeof summaryData;
type GovernanceSummary = RawSummary & {
  owner: RawSummary['owner'] & {
    allVerificationsPresent: boolean;
    automationComplete: boolean;
    capabilities: Array<
      RawSummary['owner']['capabilities'][number] & {
        verificationScriptName?: string | null;
        verificationScriptExists?: boolean;
      }
    >;
  };
};

const summary = summaryData as GovernanceSummary;

type CapabilityRow = {
  category: string;
  command: string;
  commandStatus: string;
  verification: string;
  verificationStatus: string;
};

type Metric = {
  label: string;
  value: string;
  tag: 'purple' | 'teal' | 'green' | 'orange' | 'blue' | 'red';
  description: string;
};

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(digits)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(digits)}k`;
  }
  return value.toFixed(digits);
}

function formatPercent(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function sanitize(text: string): string {
  return text.replace(/[`{}<>|]/g, '').replace(/\s+/g, ' ').trim();
}

function shortAddress(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('0x') && trimmed.length > 10) {
    return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
  }
  if (trimmed.length > 18) {
    return `${trimmed.slice(0, 9)}…${trimmed.slice(-6)}`;
  }
  return trimmed;
}

function buildGovernanceDefinition(data: GovernanceSummary): string {
  const governor = data.blockchain.contracts.find((contract) => contract.name.includes('Governor'));
  const treasury = data.blockchain.contracts.find((contract) => contract.name.includes('Treasury'));
  const slashMajor = data.incentives.slashing.severities[1]?.fraction ?? data.incentives.slashing.severities[0]?.fraction ?? 0;

  return [
    'graph TD',
    `  Owner["Owner (${sanitize(shortAddress(data.owner.owner))})"] -->|Pause / Upgrade| Governor["${sanitize(
      governor?.name ?? 'AGIJobsGovernor',
    )}"]`,
    `  Guardian["Pause Guardian (${sanitize(shortAddress(data.owner.pauser))})"] -->|Emergency stop| Governor`,
    `  Governor -->|Emission directives| Treasury["${sanitize(treasury?.name ?? 'AGIJobsTreasury')} (${sanitize(
      shortAddress(data.owner.treasury),
    )})"]`,
    `  Treasury -->|Mirror ${formatPercent(data.incentives.mint.treasuryMirrorShare)}| Vault[Treasury Vault]`,
    '  Vault -->|$AGIALPHA rewards| Agents[Agents / Validators / Operators]',
    `  Governor -->|Slash ${formatPercent(slashMajor)}| Sentinels[Sentinel Tacticians]`,
    '  Sentinels -->|Telemetry| Owner',
    '  Owner -->|CI commands| Shield[CI (v2) Shield]',
    '  Shield -->|Green checks| Owner',
  ].join('\n');
}

function buildEnergyDefinition(data: GovernanceSummary): string {
  const etaPercent = (data.incentives.mint.eta * 100).toFixed(1);
  const burn = data.incentives.burn;
  return [
    'flowchart LR',
    `  Gibbs["Gibbs ${formatNumber(data.thermodynamics.gibbsFreeEnergyKJ)} kJ"] --> Margin["Margin ${formatNumber(
      data.thermodynamics.freeEnergyMarginKJ,
    )} kJ"]`,
    `  Margin --> Landauer["Landauer ${data.thermodynamics.landauerKJ.toExponential(2)} kJ"]`,
    `  Burn["Burn per block ${formatNumber(data.thermodynamics.burnEnergyPerBlockKJ)} kJ"] --> Margin`,
    `  Entropy["Entropy ${formatNumber(data.statisticalPhysics.entropyKJPerK)} kJ/K"] --> Gibbs`,
    `  Mint["Mint η=${etaPercent}%"] --> Mirror["Treasury Mirror ${formatPercent(data.incentives.mint.treasuryMirrorShare)}"]`,
    '  Mirror --> Economy[α-AGI Economy]',
    `  Slash["Slashing ${formatPercent(data.incentives.slashing.severities[0]?.fraction ?? 0)}-${formatPercent(
      data.incentives.slashing.severities.at(-1)?.fraction ?? 0,
    )}"] --> Landauer`,
    `  Burn --> Policy["Burn Policy ${formatPercent(burn.burnBps / 10_000)} (treasury ${formatPercent(
      burn.treasuryBps / 10_000,
    )}, employer ${formatPercent(burn.employerBps / 10_000)})"]`,
  ].join('\n');
}

export default function AgiGovernanceShowcase() {
  const metrics = useMemo<Metric[]>(
    () => [
      {
        label: 'Gibbs free energy',
        value: `${formatNumber(summary.thermodynamics.gibbsFreeEnergyKJ)} kJ`,
        tag: 'purple',
        description: 'Energy reservoir captured by the governance Hamiltonian.',
      },
      {
        label: 'Free-energy margin',
        value: `${formatNumber(summary.thermodynamics.freeEnergyMarginKJ)} kJ`,
        tag: 'teal',
        description: 'Gap between operational dissipation and Landauer limit.',
      },
      {
        label: 'Mint mirror',
        value: formatPercent(summary.incentives.mint.treasuryMirrorShare),
        tag: 'green',
        description: 'Treasury share mirrored into owner-controlled vaults.',
      },
      {
        label: 'Risk residual',
        value: summary.risk.portfolioResidual.toFixed(3),
        tag: 'orange',
        description: 'Weighted residual risk after staking, formal, and fuzz defences.',
      },
      {
        label: 'Discount factor',
        value: summary.equilibrium.discountFactor.toFixed(2),
        tag: 'blue',
        description: 'Ensures unique cooperative equilibrium in repeated play.',
      },
      {
        label: 'Automation',
        value: summary.owner.automationComplete ? 'End-to-end ✅' : 'Manual follow-up',
        tag: summary.owner.automationComplete ? 'green' : 'red',
        description: 'Command + verification scripts wired for the owner.',
      },
    ],
    [],
  );

  const capabilities = useMemo<CapabilityRow[]>(() => {
    return summary.owner.capabilities.map((capability) => ({
      category: capability.category,
      command: capability.command || 'Manual procedure',
      commandStatus: capability.present
        ? capability.scriptName
          ? capability.scriptExists
            ? '✅'
            : '⚠️'
          : capability.command.trim().length === 0
          ? '—'
          : 'ℹ️'
        : '⚠️',
      verification: capability.verification || 'Manual verification',
      verificationStatus: capability.present
        ? capability.verificationScriptName
          ? capability.verificationScriptExists
            ? '✅'
            : '⚠️'
          : capability.verification.trim().length === 0
          ? '—'
          : 'ℹ️'
        : '⚠️',
    }));
  }, []);

  const governanceDefinition = useMemo(() => buildGovernanceDefinition(summary), []);
  const energyDefinition = useMemo(() => buildEnergyDefinition(summary), []);

  return (
    <div className="showcase">
      <section className="hero">
        <h1>Solving α-AGI Governance</h1>
        <p>
          This cockpit distils the full AGI Jobs v0 (v2) governance stack into a guided mission. Every insight is computed
          directly from the Hamiltonian manifest—thermodynamics, incentive tensors, antifragility curves, risk matrices, and
          owner automation pipelines—so a non-technical leader can command the platform with superintelligent leverage.
        </p>
        <div className="cta-row">
          <a className="cta primary" href="https://github.com/MontrealAI/AGIJobsv0" target="_blank" rel="noreferrer">
            View repository
          </a>
          <a className="cta secondary" href="https://github.com/MontrealAI/AGIJobsv0/tree/main/demo/agi-governance" target="_blank" rel="noreferrer">
            Demo artefacts
          </a>
          <Link className="cta secondary" href="/solving-governance">
            Launch validator cockpit
          </Link>
        </div>
        <div className="tagline-grid">
          <span className="tag purple">Hamiltonian-aligned</span>
          <span className="tag blue">CI sealed</span>
          <span className="tag green">Owner absolute</span>
          <span className="tag teal">Antifragile</span>
        </div>
      </section>

      <section>
        <h2>Thermodynamic & Incentive Telemetry</h2>
        <div className="data-grid">
          {metrics.map((metric) => (
            <div key={metric.label} className="metric-card">
              <div className="card-title">
                <h3>{metric.label}</h3>
                <span className={`tag ${metric.tag}`}>{metric.value}</span>
              </div>
              <p>{metric.description}</p>
            </div>
          ))}
        </div>
        <p>
          The demo scripts compute Gibbs free energy, energy margins, mint/burn parity, and stake-aligned slashing curves on every
          run, ensuring the intelligence engine remains thermodynamically efficient and financially balanced.
        </p>
      </section>

      <section className="grid two-column">
        <div>
          <h2>Mission Flow Atlases</h2>
          <MermaidDiagram
            definition={governanceDefinition}
            caption="Owner-first governance flow"
            className="mermaid-card"
          />
          <MermaidDiagram
            definition={energyDefinition}
            caption="Energy & incentive choreography"
            className="mermaid-card"
          />
        </div>
        <div>
          <h2>Owner Command Lattice</h2>
          <div className="status-panel">
            <div className="status-row">
              <span>Coverage achieved</span>
              <span className={`tag ${summary.owner.fullCoverage ? 'green' : 'red'}`}>
                {summary.owner.fullCoverage ? 'Complete' : 'Review'}
              </span>
            </div>
            <div className="status-row">
              <span>Command automation</span>
              <span className={`tag ${summary.owner.allCommandsPresent ? 'green' : 'orange'}`}>
                {summary.owner.allCommandsPresent ? 'Ready' : 'Missing scripts'}
              </span>
            </div>
            <div className="status-row">
              <span>Verification automation</span>
              <span className={`tag ${summary.owner.allVerificationsPresent ? 'green' : 'orange'}`}>
                {summary.owner.allVerificationsPresent ? 'Ready' : 'Add verifications'}
              </span>
            </div>
            <div className="status-row">
              <span>Automation loop</span>
              <span className={`tag ${summary.owner.automationComplete ? 'green' : 'orange'}`}>
                {summary.owner.automationComplete ? 'Closed' : 'Pending'}
              </span>
            </div>
          </div>
          <div className="scroll-table">
            <table>
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>Command</th>
                  <th>Cmd</th>
                  <th>Verification</th>
                  <th>Verif</th>
                </tr>
              </thead>
              <tbody>
                {capabilities.map((row) => (
                  <tr key={row.category}>
                    <td>{row.category}</td>
                    <td>{row.command}</td>
                    <td>{row.commandStatus}</td>
                    <td>{row.verification}</td>
                    <td>{row.verificationStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2>Risk & Antifragility Observatory</h2>
        <div className="grid three-column">
          <div className="metric-card">
            <div className="card-title">
              <h3>Residual risk</h3>
              <span className="tag orange">{summary.risk.portfolioResidual.toFixed(3)}</span>
            </div>
            <p>
              Weighted residual after staking ({formatPercent(summary.risk.weights.staking)}), formal methods (
              {formatPercent(summary.risk.weights.formal)}), and fuzz ({formatPercent(summary.risk.weights.fuzz)}).
            </p>
          </div>
          <div className="metric-card">
            <div className="card-title">
              <h3>Antifragility curvature</h3>
              <span className="tag teal">
                {summary.antifragility.quadraticSecondDerivative.toExponential(2)}
              </span>
            </div>
            <p>Positive curvature means adversarial noise increases expected welfare within the tested variance band.</p>
          </div>
          <div className="metric-card">
            <div className="card-title">
              <h3>CI shield</h3>
              <span className="tag blue">{summary.ci.workflow}</span>
            </div>
            <p>Enforces lint, tests, Foundry, coverage ≥ {summary.ci.minCoverage}%, and summary contexts on every PR and push.</p>
          </div>
        </div>
        <div className="scroll-table">
          <table>
            <thead>
              <tr>
                <th>Threat</th>
                <th>Likelihood</th>
                <th>Impact</th>
                <th>Coverage</th>
                <th>Residual</th>
              </tr>
            </thead>
            <tbody>
              {summary.risk.classes.map((riskClass) => (
                <tr key={riskClass.id}>
                  <td>{riskClass.label}</td>
                  <td>{formatNumber(riskClass.probability, 2)}</td>
                  <td>{formatNumber(riskClass.impact, 2)}</td>
                  <td>{formatPercent(riskClass.coverage)}</td>
                  <td>{riskClass.residual.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>One-command Empowerment</h2>
        <div className="cta-grid">
          <code>npm run demo:agi-governance</code>
          <code>npm run demo:agi-governance:validate</code>
          <code>npm run demo:agi-governance:ci</code>
          <code>npm run demo:agi-governance:owner-diagnostics</code>
        </div>
        <p>
          These four commands regenerate the dossier, replay every analytic independently, verify CI enforcement, and assemble the
          owner diagnostics bundle. The outputs match the artefacts stored under <code>demo/agi-governance/reports/</code> so the
          evidence trail is instant and reproducible.
        </p>
      </section>
    </div>
  );
}
