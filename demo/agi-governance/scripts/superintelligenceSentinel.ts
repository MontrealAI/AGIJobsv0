import { access, mkdir, readFile, writeFile } from "fs/promises";
import { constants as fsConstants } from "fs";
import path from "path";

import {
  REPORT_DIR,
  SUMMARY_FILE,
  loadMission,
  generateGovernanceDemo,
  type MissionConfig,
  type ReportBundle,
} from "./executeDemo";

const DEFAULT_JSON = path.join(REPORT_DIR, "governance-demo-superintelligence.json");
const DEFAULT_MARKDOWN = path.join(REPORT_DIR, "governance-demo-superintelligence.md");

export const SUPERINTELLIGENCE_JSON = DEFAULT_JSON;
export const SUPERINTELLIGENCE_MARKDOWN = DEFAULT_MARKDOWN;

export interface SuperintelligenceOptions {
  missionFile?: string;
  summaryFile?: string;
  reportDir?: string;
  jsonFile?: string;
  markdownFile?: string;
  silent?: boolean;
  autoGenerateSummary?: boolean;
}

type SuperintelligenceIndices = {
  direct: number;
  recomputed: number;
  hybrid: number;
  maxDelta: number;
  consistent: boolean;
};

type OwnerControlSignals = {
  coverageRatio: number;
  automationCoverage: number;
  verificationCoverage: number;
  pauseAuthorityConfidence: number;
  upgradeAuthorityConfidence: number;
  treasuryAuthorityConfidence: number;
  ciShieldConfidence: number;
  supremacyIndex: number;
};

type EnergyDominanceSignals = {
  freeEnergyMarginKJ: number;
  logisticEnergy: number;
  riskPenalty: number;
  thermoQuantumHarmony: number;
  antifragilityLift: number;
  equilibriumStrength: number;
};

type ScoreboardRow = {
  label: string;
  value: number;
  status: "ok" | "warn";
  rationale: string;
};

export type SuperintelligenceReport = {
  generatedAt: string;
  missionVersion: string;
  missionTitle: string;
  summarySource: string;
  indices: SuperintelligenceIndices;
  owner: OwnerControlSignals;
  energy: EnergyDominanceSignals;
  dominancePotential: number;
  capitalRealignmentPotential: number;
  unstoppableConfidence: number;
  scoreboard: ScoreboardRow[];
  mermaid: string;
  notes: string[];
};

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function logistic(value: number, midpoint = 0, steepness = 1): number {
  const scaled = steepness === 0 ? value - midpoint : (value - midpoint) * steepness;
  return 1 / (1 + Math.exp(-scaled));
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return numerator >= 0 ? 1 : 0;
  }
  return numerator / denominator;
}

function locateCapability(
  summary: ReportBundle,
  predicate: (category: string, label: string) => boolean,
): { present: boolean; automation: number; verification: number } {
  const match = summary.owner.capabilities.find((capability) =>
    predicate(capability.category.toLowerCase(), capability.label.toLowerCase()),
  );
  if (!match) {
    return { present: false, automation: 0, verification: 0 };
  }
  const automation = match.present
    ? match.scriptExists
      ? 1
      : match.scriptName
      ? 0.6
      : 0.5
    : 0;
  const verification = match.present
    ? match.verificationScriptExists
      ? 1
      : match.verification && match.verification.trim().length > 0
      ? 0.5
      : 0.25
    : 0;
  return { present: match.present, automation, verification };
}

function recomputeSuperintelligenceIndex(mission: MissionConfig, summary: ReportBundle): number {
  const weights = mission.alphaField.signatureWeights;
  const thermodynamicAssurance = clamp(
    mission.alphaField.verification.energyMarginFloorKJ <= 0
      ? 1
      : safeDivide(
          summary.thermodynamics.freeEnergyMarginKJ,
          mission.alphaField.verification.energyMarginFloorKJ,
        ),
    0,
    1,
  );
  const governanceAssurance = clamp(
    mission.risk.portfolioThreshold <= 0
      ? 1
      : 1 - safeDivide(summary.risk.portfolioResidual, mission.risk.portfolioThreshold),
    0,
    1,
  );
  const antifragilityAssurance = clamp(
    mission.alphaField.antifragility.minSecondDerivative <= 0
      ? 1
      : safeDivide(
          summary.antifragility.quadraticSecondDerivative,
          mission.alphaField.antifragility.minSecondDerivative,
        ),
    0,
    1,
  );
  const ownerAssurance = clamp(summary.alphaField.ownerSupremacyIndex, 0, 1);
  const quantumAssurance = clamp(summary.quantum.quantumConfidence, 0, 1);

  const numerator =
    weights.thermodynamic * thermodynamicAssurance +
    weights.governance * governanceAssurance +
    weights.antifragility * antifragilityAssurance +
    weights.owner * ownerAssurance +
    weights.quantum * quantumAssurance;
  const totalWeight =
    weights.thermodynamic +
    weights.governance +
    weights.antifragility +
    weights.owner +
    weights.quantum;

  return clamp(safeDivide(numerator, totalWeight), 0, 1);
}

function computeHybridIndex(mission: MissionConfig, summary: ReportBundle): number {
  const energyRatio = mission.alphaField.verification.energyMarginFloorKJ <= 0
    ? 1
    : safeDivide(
        summary.thermodynamics.freeEnergyMarginKJ,
        mission.alphaField.verification.energyMarginFloorKJ,
      );
  const logisticEnergy = logistic(energyRatio, 1, 2.2);
  const antifragilityLift = clamp(
    mission.alphaField.antifragility.minSecondDerivative <= 0
      ? 1
      : Math.sqrt(
          safeDivide(
            summary.antifragility.quadraticSecondDerivative,
            mission.alphaField.antifragility.minSecondDerivative,
          ),
        ),
    0,
    1,
  );
  const equilibriumStrength = clamp(1 - safeDivide(summary.equilibrium.maxMethodDeviation, 0.08), 0, 1);
  const riskPenalty = clamp(
    mission.risk.portfolioThreshold <= 0
      ? 1
      : 1 - safeDivide(summary.risk.portfolioResidual, mission.risk.portfolioThreshold),
    0,
    1,
  );
  const ownerSupremacy = clamp(summary.alphaField.ownerSupremacyIndex, 0, 1);
  const quantumConfidence = clamp(summary.quantum.quantumConfidence, 0, 1);

  const weighted =
    0.35 * equilibriumStrength +
    0.25 * logisticEnergy +
    0.2 * quantumConfidence +
    0.2 * ownerSupremacy;

  return clamp(weighted * riskPenalty * antifragilityLift, 0, 1);
}

function computeOwnerSignals(mission: MissionConfig, summary: ReportBundle): OwnerControlSignals {
  const coverageRatio = summary.owner.requiredCoverage.length
    ? summary.owner.requiredCoverage.filter((item) => item.satisfied).length /
      summary.owner.requiredCoverage.length
    : 1;
  const automationCoverage = summary.owner.capabilities.length
    ? summary.owner.capabilities.reduce((sum, capability) => sum + (capability.scriptExists ? 1 : 0), 0) /
      summary.owner.capabilities.length
    : 1;
  const verificationCoverage = summary.owner.capabilities.length
    ? summary.owner.capabilities.reduce(
        (sum, capability) => sum + (capability.verificationScriptExists ? 1 : 0),
        0,
      ) /
      summary.owner.capabilities.length
    : 1;

  const pauseCapability = locateCapability(summary, (category, label) =>
    category.includes("pause") || label.includes("pause"),
  );
  const upgradeCapability = locateCapability(summary, (category, label) =>
    category.includes("upgrade") || label.includes("upgrade"),
  );
  const treasuryCapability = locateCapability(summary, (category, label) =>
    category.includes("treasury") || label.includes("treasury"),
  );

  const requiredJobs = mission.ci.requiredJobs.length;
  const summaryJobs = summary.ci.requiredJobs.length;
  const jobCoverage = requiredJobs === 0 ? 1 : clamp(summaryJobs / requiredJobs, 0, 1);
  const coverageFloor = mission.ci.minCoverage;
  const coverageConfidence = coverageFloor <= 0 ? 1 : clamp(summary.ci.minCoverage / coverageFloor, 0, 1);
  const concurrencyConfidence = summary.ci.concurrency === mission.ci.concurrency ? 1 : 0.6;
  const ciShieldConfidence = clamp((jobCoverage + coverageConfidence + concurrencyConfidence) / 3, 0, 1);

  return {
    coverageRatio: clamp(coverageRatio, 0, 1),
    automationCoverage: clamp(automationCoverage, 0, 1),
    verificationCoverage: clamp(verificationCoverage, 0, 1),
    pauseAuthorityConfidence: clamp((pauseCapability.automation + pauseCapability.verification) / 2, 0, 1),
    upgradeAuthorityConfidence: clamp((upgradeCapability.automation + upgradeCapability.verification) / 2, 0, 1),
    treasuryAuthorityConfidence: clamp((treasuryCapability.automation + treasuryCapability.verification) / 2, 0, 1),
    ciShieldConfidence,
    supremacyIndex: clamp(summary.alphaField.ownerSupremacyIndex, 0, 1),
  };
}

function computeEnergySignals(mission: MissionConfig, summary: ReportBundle): EnergyDominanceSignals {
  const energyRatio = mission.alphaField.verification.energyMarginFloorKJ <= 0
    ? summary.thermodynamics.freeEnergyMarginKJ
    : safeDivide(
        summary.thermodynamics.freeEnergyMarginKJ,
        mission.alphaField.verification.energyMarginFloorKJ,
      );
  const logisticEnergy = logistic(energyRatio, 1, 2.2);
  const rawThermoQuantumDelta = Math.abs(summary.alphaField.thermoQuantumDeltaKJ);
  const maxDrift = mission.alphaField.verification.thermoQuantumDriftMaximumKJ;
  const logisticHarmony = maxDrift <= 0 ? 1 : 1 / (1 + rawThermoQuantumDelta / Math.max(maxDrift, 1e-9));
  const thermoQuantumHarmony = summary.alphaField.thermoQuantumAligned
    ? clamp(logisticHarmony, 0.75, 1)
    : clamp(logisticHarmony, 0.55, 0.85);
  const riskPenalty = clamp(
    mission.risk.portfolioThreshold <= 0
      ? 1
      : 1 - safeDivide(summary.risk.portfolioResidual, mission.risk.portfolioThreshold),
    0,
    1,
  );
  const antifragilityLift = clamp(
    mission.alphaField.antifragility.minSecondDerivative <= 0
      ? 1
      : safeDivide(
          summary.antifragility.quadraticSecondDerivative,
          mission.alphaField.antifragility.minSecondDerivative,
        ),
    0,
    1,
  );
  const equilibriumStrength = clamp(1 - safeDivide(summary.equilibrium.maxMethodDeviation, 0.08), 0, 1);

  return {
    freeEnergyMarginKJ: summary.thermodynamics.freeEnergyMarginKJ,
    logisticEnergy,
    riskPenalty,
    thermoQuantumHarmony,
    antifragilityLift,
    equilibriumStrength,
  };
}

function buildScoreboard(
  indices: SuperintelligenceIndices,
  owner: OwnerControlSignals,
  energy: EnergyDominanceSignals,
  hybrid: number,
): ScoreboardRow[] {
  const agreementScore = clamp(1 - indices.maxDelta, 0, 1);

  const rows: ScoreboardRow[] = [
    {
      label: "Superintelligence index (direct)",
      value: indices.direct,
      status: indices.direct >= 0.8 ? "ok" : "warn",
      rationale: indices.direct >= 0.8 ? "meets superintelligence floor" : "requires reinforcement",
    },
    {
      label: "Multi-method agreement",
      value: agreementScore,
      status: indices.consistent ? "ok" : "warn",
      rationale: indices.consistent
        ? "all methods cohere within 1.5%"
        : "variance exceeds 1.5% tolerance",
    },
    {
      label: "Owner supremacy", // emphasise owner control
      value: owner.supremacyIndex,
      status: owner.supremacyIndex >= 0.85 ? "ok" : "warn",
      rationale: owner.supremacyIndex >= 0.85 ? "owner retains command over every lever" : "complete coverage required",
    },
    {
      label: "Pause authority", // ensures pausing ability
      value: owner.pauseAuthorityConfidence,
      status: owner.pauseAuthorityConfidence >= 0.75 ? "ok" : "warn",
      rationale:
        owner.pauseAuthorityConfidence >= 0.75
          ? "pause scripts & verifiers armed"
          : "establish pause automation + verification",
    },
    {
      label: "Upgrade authority",
      value: owner.upgradeAuthorityConfidence,
      status: owner.upgradeAuthorityConfidence >= 0.75 ? "ok" : "warn",
      rationale:
        owner.upgradeAuthorityConfidence >= 0.75
          ? "owner can pivot the stack instantly"
          : "wire upgrade commands + verifiers",
    },
    {
      label: "Treasury authority",
      value: owner.treasuryAuthorityConfidence,
      status: owner.treasuryAuthorityConfidence >= 0.75 ? "ok" : "warn",
      rationale:
        owner.treasuryAuthorityConfidence >= 0.75
          ? "treasury manoeuvres under owner key"
          : "route treasury scripts + verification",
    },
    {
      label: "Thermo ↔ quantum harmony",
      value: energy.thermoQuantumHarmony,
      status: energy.thermoQuantumHarmony >= 0.9 ? "ok" : "warn",
      rationale:
        energy.thermoQuantumHarmony >= 0.9
          ? "quantum lattice phase-locked"
          : "investigate thermodynamic drift",
    },
    {
      label: "Risk penalty",
      value: energy.riskPenalty,
      status: energy.riskPenalty >= 0.75 ? "ok" : "warn",
      rationale:
        energy.riskPenalty >= 0.75
          ? "residual risk below threshold"
          : "drive portfolio residual down",
    },
    {
      label: "Hybrid dominance index",
      value: hybrid,
      status: hybrid >= 0.78 ? "ok" : "warn",
      rationale: hybrid >= 0.78 ? "physics + governance synergy proven" : "re-run antifragility drills",
    },
  ];

  return rows;
}

function buildMermaidDiagram(report: SuperintelligenceReport): string {
  const energyPercent = (report.energy.logisticEnergy * 100).toFixed(1);
  const riskPercent = (report.energy.riskPenalty * 100).toFixed(1);
  const ownerPercent = (report.owner.supremacyIndex * 100).toFixed(1);
  const superPercent = (report.indices.direct * 100).toFixed(1);
  const dominancePercent = (report.dominancePotential * 100).toFixed(1);
  const unstoppablePercent = (report.unstoppableConfidence * 100).toFixed(1);

  return [
    "```mermaid",
    "flowchart LR",
    "  subgraph Thermodynamic Field",
    `    EnergyMargin[Free-energy margin ${report.energy.freeEnergyMarginKJ.toFixed(0)} kJ] -->|logistic ${energyPercent}%| EnergyPulse((Hamiltonian Pulse))`,
    "    EnergyPulse -->|antifragility lift| AntifragileTensor{Antifragility}",
    "  end",
    "  subgraph Quantum Lattice",
    `    QuantumHarmony[Thermo-quantum harmony ${(report.energy.thermoQuantumHarmony * 100).toFixed(1)}%] --> CoherenceWave((Coherence))`,
    "    CoherenceWave -->|risk filter| QuantumShield",
    `    QuantumShield[Risk penalty ${riskPercent}%] --> DominanceField((Dominance))`,
    "  end",
    "  subgraph Owner Command",
    `    OwnerSupremacy[Owner supremacy ${ownerPercent}%] --> PauseAuthority((Pause authority ${
      (report.owner.pauseAuthorityConfidence * 100).toFixed(1)
    }%))`,
    "    OwnerSupremacy --> UpgradeAuthority((Upgrade authority))",
    "    PauseAuthority --> CommandFusion",
    "    UpgradeAuthority --> CommandFusion",
    "  end",
    "  EnergyPulse --> DominanceField",
    "  AntifragileTensor --> DominanceField",
    "  DominanceField --> CommandFusion",
    `  CommandFusion --> SuperIndex[Superintelligence ${superPercent}%]`,
    `  SuperIndex --> CapitalRealignment[Capital realignment ${(report.capitalRealignmentPotential * 100).toFixed(1)}%]`,
    `  CapitalRealignment --> Impact((Unstoppable lattice ${unstoppablePercent}%))`,
    `  Impact -->|feedback| OwnerSupremacy`,
    "```",
  ].join("\n");
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(digits);
}

function buildMarkdown(report: SuperintelligenceReport): string {
  const scoreboardRows = report.scoreboard
    .map(
      (row) =>
        `| ${row.label} | ${formatPercent(row.value)} | ${row.status === "ok" ? "✅" : "⚠️"} | ${row.rationale} |`,
    )
    .join("\n");

  return [
    "# 🎖️ Solving α-AGI Governance 👁️✨ — Superintelligence Sentinel",
    "",
    `Generated ${report.generatedAt} • Mission ${report.missionVersion} — ${report.missionTitle}`,
    "",
    "## Multi-method verification",
    "",
    `- **Direct index:** ${formatPercent(report.indices.direct)} (summary reference)`,
    `- **Recomputed index:** ${formatPercent(report.indices.recomputed)} (fresh calculation from manifest)`,
    `- **Hybrid index:** ${formatPercent(report.indices.hybrid)} (physics × governance synthesis)`,
    `- **Max method delta:** ${(report.indices.maxDelta * 100).toFixed(2)}% (${report.indices.consistent ? "✅ consistent" : "⚠️ investigate"})`,
    "",
    report.mermaid,
    "",
    "## Dominance & capital realignment",
    "",
    `- **Dominance potential:** ${formatPercent(report.dominancePotential)} (energy × owner × quantum)`,
    `- **Capital realignment potential:** ${formatPercent(report.capitalRealignmentPotential)} (breakthrough leverage)` ,
    `- **Unstoppable confidence:** ${formatPercent(report.unstoppableConfidence)} (minimum across strategic pillars)`,
    "",
    "## Owner sovereignty",
    "",
    `- **Coverage ratio:** ${formatPercent(report.owner.coverageRatio)} of required capabilities accounted for`,
    `- **Automation coverage:** ${formatPercent(report.owner.automationCoverage)} of command scripts wired`,
    `- **Verification coverage:** ${formatPercent(report.owner.verificationCoverage)} of verifier scripts wired`,
    `- **Pause authority:** ${formatPercent(report.owner.pauseAuthorityConfidence)} (command + verification)`,
    `- **Upgrade authority:** ${formatPercent(report.owner.upgradeAuthorityConfidence)}`,
    `- **Treasury authority:** ${formatPercent(report.owner.treasuryAuthorityConfidence)}`,
    `- **CI shield confidence:** ${formatPercent(report.owner.ciShieldConfidence)} enforced jobs / coverage`,
    "",
    "## Thermodynamic lattice",
    "",
    `- **Free-energy margin:** ${formatNumber(report.energy.freeEnergyMarginKJ, 0)} kJ`,
    `- **Logistic energy:** ${formatPercent(report.energy.logisticEnergy)}`,
    `- **Thermo ↔ quantum harmony:** ${formatPercent(report.energy.thermoQuantumHarmony)}`,
    `- **Antifragility lift:** ${formatPercent(report.energy.antifragilityLift)}`,
    `- **Equilibrium strength:** ${formatPercent(report.energy.equilibriumStrength)}`,
    `- **Risk penalty:** ${formatPercent(report.energy.riskPenalty)}`,
    "",
    "## Scoreboard",
    "",
    "| Signal | Value | Status | Rationale |",
    "| --- | --- | --- | --- |",
    scoreboardRows,
    "",
    "## Notes",
    "",
    report.notes.length ? report.notes.map((note) => `- ${note}`).join("\n") : "- All verifications satisfied.",
  ].join("\n");
}

function buildJson(report: SuperintelligenceReport): SuperintelligenceReport {
  return report;
}

async function ensureSummary(options: SuperintelligenceOptions): Promise<string> {
  const summaryPath = path.resolve(options.summaryFile ?? SUMMARY_FILE);
  try {
    await access(summaryPath, fsConstants.F_OK);
    return summaryPath;
  } catch {
    if (!options.autoGenerateSummary) {
      throw new Error(
        `Summary JSON not found at ${summaryPath}. Run \`npm run demo:agi-governance\` or enable autoGenerateSummary.`,
      );
    }
    await generateGovernanceDemo({ missionFile: options.missionFile, reportDir: options.reportDir });
    return summaryPath;
  }
}

export async function runSuperintelligenceSentinel(
  options: SuperintelligenceOptions = {},
): Promise<SuperintelligenceReport> {
  const mission = await loadMission(options.missionFile);
  const summaryPath = await ensureSummary(options);
  const summaryBuffer = await readFile(summaryPath, "utf8");
  const summary = JSON.parse(summaryBuffer) as ReportBundle;

  const direct = clamp(summary.alphaField.superintelligenceIndex, 0, 1);
  const recomputed = recomputeSuperintelligenceIndex(mission, summary);
  const hybrid = computeHybridIndex(mission, summary);
  const maxDelta = Math.max(
    Math.abs(direct - recomputed),
    Math.abs(direct - hybrid),
    Math.abs(recomputed - hybrid),
  );
  const consistent = maxDelta <= 0.015;

  const owner = computeOwnerSignals(mission, summary);
  const energy = computeEnergySignals(mission, summary);

  const dominancePotential = clamp(
    0.4 * direct +
      0.2 * energy.logisticEnergy +
      0.15 * owner.supremacyIndex +
      0.15 * energy.thermoQuantumHarmony +
      0.1 * energy.antifragilityLift,
    0,
    1,
  );
  const capitalRealignmentPotential = clamp(
    Math.min(dominancePotential, hybrid + 0.05) * Math.max(energy.riskPenalty, 0.55) * owner.ciShieldConfidence,
    0,
    1,
  );
  const baseConfidence = Math.min(
    direct,
    owner.pauseAuthorityConfidence,
    owner.upgradeAuthorityConfidence,
    owner.treasuryAuthorityConfidence,
    owner.ciShieldConfidence,
  );
  const unstoppableConfidence = clamp(
    0.6 * baseConfidence +
      0.2 * Math.max(energy.riskPenalty, 0.55) +
      0.2 * Math.max(energy.thermoQuantumHarmony, 0.55),
    0,
    1,
  );

  const indices: SuperintelligenceIndices = {
    direct,
    recomputed,
    hybrid,
    maxDelta,
    consistent,
  };

  const scoreboard = buildScoreboard(indices, owner, energy, hybrid);

  const notes: string[] = [];
  if (!consistent) {
    notes.push(
      `Multi-method verification drift detected (max delta ${(maxDelta * 100).toFixed(2)}%). Re-run thermodynamic calibration and antifragility drill.`,
    );
  } else {
    notes.push("Multi-method verification aligned within ≤1.5% tolerance.");
  }
  if (owner.pauseAuthorityConfidence < 0.75) {
    notes.push("Reinforce pause authority scripts and verifiers to keep emergency stop instantaneous.");
  }
  if (owner.upgradeAuthorityConfidence < 0.75) {
    notes.push("Wire upgrade automation + verification to maintain unstoppable reconfiguration.");
  }
  if (energy.thermoQuantumHarmony < 0.9) {
    notes.push("Thermo-quantum drift approaching tolerance: inspect Hamiltonian coupling + quantum lattice alignment.");
  }
  if (energy.riskPenalty < 0.75) {
    notes.push("Residual risk elevated: execute slashing drills and refresh fuzzing program.");
  }
  if (notes.length === 1 && notes[0].startsWith("Multi-method")) {
    notes.push("Owner sovereignty, thermodynamic envelope, and quantum lattice all within mission tolerances.");
  }

  const report: SuperintelligenceReport = {
    generatedAt: new Date().toISOString(),
    missionVersion: mission.meta.version,
    missionTitle: mission.meta.title,
    summarySource: summaryPath,
    indices,
    owner,
    energy,
    dominancePotential,
    capitalRealignmentPotential,
    unstoppableConfidence,
    scoreboard,
    mermaid: "",
    notes,
  };

  report.mermaid = buildMermaidDiagram(report);

  const reportDir = path.resolve(options.reportDir ?? path.dirname(options.jsonFile ?? DEFAULT_JSON));
  const jsonFile = path.resolve(options.jsonFile ?? path.join(reportDir, path.basename(DEFAULT_JSON)));
  const markdownFile = path.resolve(
    options.markdownFile ?? path.join(reportDir, path.basename(DEFAULT_MARKDOWN)),
  );

  await mkdir(path.dirname(jsonFile), { recursive: true });
  await mkdir(path.dirname(markdownFile), { recursive: true });

  await writeFile(jsonFile, JSON.stringify(buildJson(report), null, 2), "utf8");
  await writeFile(markdownFile, buildMarkdown(report), "utf8");

  if (!options.silent && !process.env.CI) {
    console.log(`↳ Superintelligence JSON written to ${jsonFile}`);
    console.log(`↳ Superintelligence Markdown written to ${markdownFile}`);
  }

  return report;
}

async function main(): Promise<void> {
  await runSuperintelligenceSentinel({ autoGenerateSummary: true });
  console.log(
    `✅ Superintelligence sentinel dossier generated: ${DEFAULT_JSON} + ${DEFAULT_MARKDOWN}`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to generate superintelligence sentinel report:", error);
    process.exitCode = 1;
  });
}
