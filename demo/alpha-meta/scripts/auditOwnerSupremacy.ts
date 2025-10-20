import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { loadMission } from "../../agi-governance/scripts/executeDemo";
import { updateManifest } from "./manifestUtils";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const DEFAULT_MISSION_FILE = path.join(BASE_DIR, "config", "mission@alpha-meta.json");
const DEFAULT_JSON = path.join(REPORT_DIR, "alpha-meta-owner-supremacy.json");
const DEFAULT_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-owner-supremacy.md");
const DEFAULT_MANIFEST = path.join(REPORT_DIR, "alpha-meta-manifest.json");

type Capability = {
  category: string;
  label: string;
  description: string;
  command: string;
  verification: string;
};

type UpgradeAction = {
  label: string;
  command: string;
  impact: string;
  category: string;
};

type CategoryAudit = {
  category: string;
  capabilityCount: number;
  capabilities: Capability[];
  actionCount: number;
  actions: UpgradeAction[];
  hasCapability: boolean;
  hasAction: boolean;
  status: "ok" | "partial" | "missing";
};

export type OwnerSupremacyAudit = {
  generatedAt: string;
  durationMs: number;
  owner: string;
  pauser: string;
  treasury: string;
  timelockSeconds: number;
  categories: CategoryAudit[];
  coverage: {
    total: number;
    satisfied: number;
    ratio: number;
    capabilityCoverage: number;
    actionCoverage: number;
    ok: boolean;
    missingCategories: string[];
  };
  monitoring: {
    sentinels: string[];
    count: number;
    ok: boolean;
  };
  verdict: {
    ok: boolean;
    reason: string;
  };
  notes: string[];
  outputs: {
    json: string;
    markdown: string;
  };
};

export interface OwnerSupremacyOptions {
  missionFile?: string;
  outputJson?: string;
  outputMarkdown?: string;
  manifestFile?: string;
}

function statusFor(category: CategoryAudit): "ok" | "partial" | "missing" {
  if (category.hasCapability && category.hasAction) {
    return "ok";
  }
  if (category.hasCapability || category.hasAction) {
    return "partial";
  }
  return "missing";
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function buildMermaid(categories: CategoryAudit[], monitoringOk: boolean): string {
  const lines: string[] = [
    "flowchart LR",
    "  owner((Owner Command Core)):::owner",
  ];

  categories.forEach((category, index) => {
    const id = `cat_${index}`;
    const symbol = category.status === "ok" ? "✅" : category.status === "partial" ? "⚠️" : "❌";
    const label = `${category.category} ${symbol}`;
    lines.push(`  owner -->|${category.category}| ${id}{${label}}`);
    const className = category.status === "ok" ? "ok" : category.status === "partial" ? "warn" : "err";
    lines.push(`  class ${id} ${className};`);
  });

  lines.push("  owner --> monitoring((Monitoring Sentinels))");
  lines.push(`  class monitoring ${monitoringOk ? "ok" : "warn"};`);
  lines.push("  classDef owner fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#e0f2fe;");
  lines.push("  classDef ok fill:#0b7a53,stroke:#bbf7d0,stroke-width:2px,color:#ecfdf5;");
  lines.push("  classDef warn fill:#854d0e,stroke:#facc15,stroke-width:2px,color:#fef9c3;");
  lines.push("  classDef err fill:#7f1d1d,stroke:#f87171,stroke-width:2px,color:#fee2e2;");

  return lines.join("\n");
}

function formatCategoryMarkdown(category: CategoryAudit): string {
  const capabilityList = category.capabilities
    .map((capability) => `      - ${capability.label} → \`${capability.command}\` (verify: ${capability.verification})`)
    .join("\n");
  const actionList = category.actions
    .map((action) => `      - ${action.label} → \`${action.command}\``)
    .join("\n");

  const capabilityBlock = capabilityList || "      - _(no critical capability registered)_";
  const actionBlock = actionList || "      - _(no upgrade or automation command registered)_";

  const indicator = category.status === "ok" ? "✅" : category.status === "partial" ? "⚠️" : "❌";

  return [
    `- **${category.category}** ${indicator}`,
    "  - Critical capabilities:",
    capabilityBlock,
    "  - Upgrade / automation commands:",
    actionBlock,
  ].join("\n");
}

async function writeMarkdown(report: OwnerSupremacyAudit, filePath: string): Promise<void> {
  const lines: string[] = [
    "# Alpha-Meta Owner Supremacy Audit",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Duration: ${(report.durationMs / 1000).toFixed(2)} s`,
    `- Owner: ${report.owner}`,
    `- Pauser: ${report.pauser}`,
    `- Treasury: ${report.treasury}`,
    `- Timelock: ${Math.round(report.timelockSeconds / 3600)} hours`,
    `- Coverage: ${formatPercent(report.coverage.ratio)} (capabilities ${formatPercent(report.coverage.capabilityCoverage)}, actions ${formatPercent(report.coverage.actionCoverage)})`,
    `- Monitoring sentinels: ${report.monitoring.count} (${report.monitoring.ok ? "✅" : "⚠️"})`,
    "",
    "## Category coverage",
  ];

  report.categories.forEach((category) => {
    lines.push(formatCategoryMarkdown(category));
    lines.push("");
  });

  lines.push("## Monitoring lattice");
  lines.push("");
  if (report.monitoring.sentinels.length === 0) {
    lines.push("- _(no sentinels registered)_");
  } else {
    report.monitoring.sentinels.forEach((sentinel) => {
      lines.push(`- ${sentinel}`);
    });
  }

  lines.push("");
  lines.push("## Owner supremacy mermaid map");
  lines.push("");
  lines.push("```mermaid");
  lines.push(buildMermaid(report.categories, report.monitoring.ok));
  lines.push("```");
  lines.push("");
  lines.push("## Notes");
  lines.push("");

  if (report.notes.length === 0) {
    lines.push("- All governance levers are fully instrumented under owner command.");
  } else {
    report.notes.forEach((note) => {
      lines.push(`- ${note}`);
    });
  }

  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

export async function auditOwnerSupremacy(options: OwnerSupremacyOptions = {}): Promise<OwnerSupremacyAudit> {
  const startedAt = Date.now();
  const missionFile = path.resolve(options.missionFile ?? DEFAULT_MISSION_FILE);
  const mission = await loadMission(missionFile);

  const reportDir = options.outputJson ? path.dirname(path.resolve(options.outputJson)) : REPORT_DIR;
  await mkdir(reportDir, { recursive: true });
  await mkdir(path.dirname(path.resolve(options.outputMarkdown ?? DEFAULT_MARKDOWN)), { recursive: true });

  const required = mission.ownerControls.requiredCategories ?? [];
  const capabilities = mission.ownerControls.criticalCapabilities as Capability[];
  const actions = mission.ownerControls.upgradeActions as UpgradeAction[];

  const categories: CategoryAudit[] = required.map((category) => {
    const matchingCapabilities = capabilities.filter((capability) => capability.category === category);
    const matchingActions = actions.filter((action) => action.category === category);
    const audit: CategoryAudit = {
      category,
      capabilityCount: matchingCapabilities.length,
      capabilities: matchingCapabilities,
      actionCount: matchingActions.length,
      actions: matchingActions,
      hasCapability: matchingCapabilities.length > 0,
      hasAction: matchingActions.length > 0,
      status: "missing",
    };
    audit.status = statusFor(audit);
    return audit;
  });

  const satisfied = categories.filter((category) => category.status === "ok").length;
  const capabilityCoverage = categories.filter((category) => category.hasCapability).length / (categories.length || 1);
  const actionCoverage = categories.filter((category) => category.hasAction).length / (categories.length || 1);
  const ratio = categories.length === 0 ? 1 : satisfied / categories.length;
  const missingCategories = categories.filter((category) => category.status !== "ok").map((category) => category.category);

  const coverageOk = ratio === 1 && capabilityCoverage === 1 && actionCoverage === 1;

  const monitoringSentinels = mission.ownerControls.monitoringSentinels ?? [];
  const monitoringOk = monitoringSentinels.length >= Math.max(3, Math.ceil(required.length / 3));

  const notes: string[] = [];
  if (!coverageOk) {
    notes.push(
      missingCategories.length
        ? `Remediate categories lacking full coverage: ${missingCategories.join(", ")}.`
        : "Owner categories require additional instrumentation.",
    );
  }
  if (!monitoringOk) {
    notes.push("Augment sentinel monitoring to cover antifragility, treasury, quantum, and pause controls.");
  }

  const report: OwnerSupremacyAudit = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    owner: mission.ownerControls.owner,
    pauser: mission.ownerControls.pauser,
    treasury: mission.ownerControls.treasury,
    timelockSeconds: mission.ownerControls.timelockSeconds,
    categories,
    coverage: {
      total: categories.length,
      satisfied,
      ratio,
      capabilityCoverage,
      actionCoverage,
      ok: coverageOk,
      missingCategories,
    },
    monitoring: {
      sentinels: monitoringSentinels,
      count: monitoringSentinels.length,
      ok: monitoringOk,
    },
    verdict: {
      ok: coverageOk && monitoringOk,
      reason:
        coverageOk && monitoringOk
          ? "Owner commands provide complete coverage with adequate sentinel monitoring."
          : "Owner coverage requires remediation before declaring supremacy.",
    },
    notes,
    outputs: {
      json: path.resolve(options.outputJson ?? DEFAULT_JSON),
      markdown: path.resolve(options.outputMarkdown ?? DEFAULT_MARKDOWN),
    },
  };

  await writeFile(report.outputs.json, JSON.stringify(report, null, 2), "utf8");
  await writeMarkdown(report, report.outputs.markdown);
  await updateManifest(options.manifestFile ?? DEFAULT_MANIFEST, [report.outputs.json, report.outputs.markdown]);

  return report;
}

if (require.main === module) {
  auditOwnerSupremacy()
    .then((report) => {
      const status = report.verdict.ok ? "✅" : "⚠️";
      console.log(`${status} Owner supremacy audit complete.`);
      console.log(`   JSON: ${report.outputs.json}`);
      console.log(`   Markdown: ${report.outputs.markdown}`);
      if (!report.verdict.ok) {
        console.log(`   Reason: ${report.verdict.reason}`);
        if (report.coverage.missingCategories.length > 0) {
          console.log(`   Missing categories: ${report.coverage.missingCategories.join(", ")}`);
        }
      }
    })
    .catch((error) => {
      console.error("❌ Failed to execute owner supremacy audit:", error);
      process.exitCode = 1;
    });
}
