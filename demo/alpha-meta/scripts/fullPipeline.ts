import { readFile, writeFile } from "fs/promises";
import path from "path";
import { runFullDemo, type FullDemoOptions } from "../../agi-governance/scripts/runFullDemo";
import {
  executeTriangulation,
  type TriangulationOptions,
  type TriangulationResult,
} from "./triangulateMission";
import {
  auditOwnerSupremacy,
  type OwnerSupremacyOptions,
  type OwnerSupremacyAudit,
} from "./auditOwnerSupremacy";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission@alpha-meta.json");

const REPORT_FILE = path.join(REPORT_DIR, "alpha-meta-governance-report.md");
const SUMMARY_FILE = path.join(REPORT_DIR, "alpha-meta-governance-summary.json");
const DASHBOARD_FILE = path.join(REPORT_DIR, "alpha-meta-governance-dashboard.html");
const OWNER_MATRIX_JSON = path.join(REPORT_DIR, "alpha-meta-owner-matrix.json");
const OWNER_MATRIX_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-owner-matrix.md");
const VALIDATION_JSON = path.join(REPORT_DIR, "alpha-meta-governance-validation.json");
const VALIDATION_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-governance-validation.md");
const CI_REPORT = path.join(REPORT_DIR, "alpha-meta-ci-verification.json");
const OWNER_JSON = path.join(REPORT_DIR, "alpha-meta-owner-diagnostics.json");
const OWNER_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-owner-diagnostics.md");
const OWNER_SUPREMACY_JSON = path.join(REPORT_DIR, "alpha-meta-owner-supremacy.json");
const OWNER_SUPREMACY_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-owner-supremacy.md");
const FULL_JSON = path.join(REPORT_DIR, "alpha-meta-full-run.json");
const FULL_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-full-run.md");
const MANIFEST = path.join(REPORT_DIR, "alpha-meta-manifest.json");
const TRIANGULATION_JSON = path.join(REPORT_DIR, "alpha-meta-triangulation.json");
const TRIANGULATION_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-triangulation.md");

function formatSeconds(durationMs: number): string {
  if (!Number.isFinite(durationMs)) {
    return "n/a";
  }
  return `${(durationMs / 1000).toFixed(2)} s`;
}

function formatDelta(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 1e-3) {
    return value.toFixed(6);
  }
  return value.toExponential(3);
}

async function updateFullRunArtifacts(
  triangulation: TriangulationResult,
  ownerAudit: OwnerSupremacyAudit,
): Promise<void> {
  try {
    const raw = await readFile(FULL_JSON, "utf8");
    const document = JSON.parse(raw) as Record<string, unknown> & {
      steps?: Array<Record<string, unknown>>;
      artifacts?: Record<string, unknown>;
    };

    const triangulationStep = {
      id: "triangulation",
      label: "Triangulation cross-check",
      status: triangulation.success ? "success" : "error",
      durationMs: triangulation.durationMs,
      details: triangulation.success
        ? `All checks satisfied (max Δ=${formatDelta(triangulation.maxDeviation)})`
        : `Deviations detected (max Δ=${formatDelta(triangulation.maxDeviation)})`,
    };

    const ownerStatus = ownerAudit.verdict.ok ? "success" : ownerAudit.coverage.ok ? "warning" : "error";
    const ownerDetails = ownerAudit.verdict.ok
      ? "All critical categories and sentinels confirmed."
      : ownerAudit.coverage.missingCategories.length > 0
        ? `Remediate categories: ${ownerAudit.coverage.missingCategories.join(", ")}`
        : "Extend sentinel coverage to satisfy monitoring requirements.";
    const ownerStep = {
      id: "owner-supremacy",
      label: "Owner supremacy audit",
      status: ownerStatus,
      durationMs: ownerAudit.durationMs,
      details: ownerDetails,
    };

    if (!Array.isArray(document.steps)) {
      document.steps = [];
    }
    const existingIndex = document.steps.findIndex((entry) => entry && entry.id === "triangulation");
    if (existingIndex >= 0) {
      document.steps[existingIndex] = triangulationStep;
    } else {
      document.steps.push(triangulationStep);
    }

    const ownerIndex = document.steps.findIndex((entry) => entry && entry.id === "owner-supremacy");
    if (ownerIndex >= 0) {
      document.steps[ownerIndex] = ownerStep;
    } else {
      document.steps.push(ownerStep);
    }

    document.artifacts = {
      ...(document.artifacts ?? {}),
      triangulationJson: triangulation.outputs.json,
      triangulationMarkdown: triangulation.outputs.markdown,
      ownerSupremacyJson: ownerAudit.outputs.json,
      ownerSupremacyMarkdown: ownerAudit.outputs.markdown,
    };

    await writeFile(FULL_JSON, JSON.stringify(document, null, 2), "utf8");
  } catch (error) {
    console.warn("⚠️ Unable to update Alpha-Meta full-run JSON with triangulation results:", error);
  }

  try {
    let markdown = await readFile(FULL_MARKDOWN, "utf8");

    const lines = markdown.split("\n");
    const tableHeaderIndex = lines.findIndex((line) => line.trim().startsWith("| Step |"));
    const separatorIndex = lines.findIndex((line, index) => index > tableHeaderIndex && line.trim().startsWith("| ---"));
    if (tableHeaderIndex !== -1 && separatorIndex !== -1) {
      let cursor = separatorIndex + 1;
      while (cursor < lines.length && lines[cursor].startsWith("|")) {
        if (lines[cursor].includes("Triangulation cross-check") || lines[cursor].includes("Owner supremacy audit")) {
          lines.splice(cursor, 1);
        } else {
          cursor += 1;
        }
      }
      const status = triangulation.success ? "✅" : "❌";
      const details = triangulation.success
        ? `All checks satisfied (max Δ=${formatDelta(triangulation.maxDeviation)})`
        : `Deviations detected (max Δ=${formatDelta(triangulation.maxDeviation)})`;
      const ownerStatusMark = ownerAudit.verdict.ok ? "✅" : ownerAudit.coverage.ok ? "⚠️" : "❌";
      const ownerDetailsText = ownerAudit.verdict.ok
        ? "All governance categories instrumented."
        : ownerAudit.coverage.missingCategories.length > 0
          ? `Remediate categories: ${ownerAudit.coverage.missingCategories.join(", ")}`
          : "Expand monitoring sentinels before production.";
      const rows = [
        `| Triangulation cross-check | ${status} | ${formatSeconds(triangulation.durationMs)} | ${details} |`,
        `| Owner supremacy audit | ${ownerStatusMark} | ${formatSeconds(ownerAudit.durationMs)} | ${ownerDetailsText} |`,
      ];
      lines.splice(cursor, 0, ...rows);
    }

    const filtered = lines.filter(
      (line) =>
        !line.includes("Triangulation JSON:") &&
        !line.includes("Triangulation Markdown:") &&
        !line.includes("Owner supremacy JSON:") &&
        !line.includes("Owner supremacy Markdown:"),
    );
    const fullRunIndex = filtered.findIndex((line) => line.includes("- Full-run Markdown:"));
    if (fullRunIndex !== -1) {
      filtered.splice(
        fullRunIndex + 1,
        0,
        `- Triangulation JSON: \`${triangulation.outputs.json}\``,
        `- Triangulation Markdown: \`${triangulation.outputs.markdown}\``,
        `- Owner supremacy JSON: \`${ownerAudit.outputs.json}\``,
        `- Owner supremacy Markdown: \`${ownerAudit.outputs.markdown}\``,
      );
    }

    markdown = filtered.join("\n");
    await writeFile(FULL_MARKDOWN, markdown, "utf8");
  } catch (error) {
    console.warn("⚠️ Unable to update Alpha-Meta full-run Markdown with triangulation results:", error);
  }
}

async function main(): Promise<void> {
  const options: FullDemoOptions = {
    demo: {
      missionFile: MISSION_FILE,
      reportDir: REPORT_DIR,
      reportFile: REPORT_FILE,
      summaryFile: SUMMARY_FILE,
      dashboardFile: DASHBOARD_FILE,
      ownerMatrixJsonFile: OWNER_MATRIX_JSON,
      ownerMatrixMarkdownFile: OWNER_MATRIX_MARKDOWN,
    },
    validation: {
      missionFile: MISSION_FILE,
      summaryFile: SUMMARY_FILE,
      outputJson: VALIDATION_JSON,
      outputMarkdown: VALIDATION_MARKDOWN,
    },
    ci: {
      missionFile: MISSION_FILE,
      outputFile: CI_REPORT,
    },
    owner: {
      jsonFile: OWNER_JSON,
      markdownFile: OWNER_MARKDOWN,
      silent: true,
      missionFile: MISSION_FILE,
      offline: true,
    },
    outputJson: FULL_JSON,
    outputMarkdown: FULL_MARKDOWN,
    manifestFile: MANIFEST,
  };

  const summary = await runFullDemo(options);

  const triangulationOptions: TriangulationOptions = {
    missionFile: MISSION_FILE,
    summaryFile: SUMMARY_FILE,
    outputJson: TRIANGULATION_JSON,
    outputMarkdown: TRIANGULATION_MARKDOWN,
    manifestFile: MANIFEST,
  };

  const triangulation = await executeTriangulation(triangulationOptions);
  const ownerSupremacyOptions: OwnerSupremacyOptions = {
    missionFile: MISSION_FILE,
    outputJson: OWNER_SUPREMACY_JSON,
    outputMarkdown: OWNER_SUPREMACY_MARKDOWN,
    manifestFile: MANIFEST,
  };
  const ownerSupremacy = await auditOwnerSupremacy(ownerSupremacyOptions);
  await updateFullRunArtifacts(triangulation, ownerSupremacy);

  const hasError = summary.steps.some((step) => step.status === "error");
  const hasWarning = summary.steps.some((step) => step.status === "warning");

  const triangulationFailed = !triangulation.success;
  const ownerAuditFailed = !ownerSupremacy.verdict.ok;

  if (hasError || triangulationFailed || ownerAuditFailed) {
    console.error("❌ Alpha-Meta full pipeline completed with errors.");
    process.exitCode = 1;
  } else if (hasWarning) {
    console.warn("⚠️ Alpha-Meta full pipeline completed with warnings.");
  } else {
    console.log("✅ Alpha-Meta full pipeline executed cleanly.");
  }

  console.log(`   Aggregated JSON: ${FULL_JSON}`);
  console.log(`   Aggregated Markdown: ${FULL_MARKDOWN}`);
  console.log(`   Manifest: ${MANIFEST}`);
  const statusEmoji = triangulation.success ? "✅" : "❌";
  console.log(`${statusEmoji} Triangulation dossier: ${TRIANGULATION_JSON}`);
  console.log(`   Triangulation Markdown: ${TRIANGULATION_MARKDOWN}`);
  const ownerEmoji = ownerSupremacy.verdict.ok ? "✅" : ownerSupremacy.coverage.ok ? "⚠️" : "❌";
  console.log(`${ownerEmoji} Owner supremacy audit: ${OWNER_SUPREMACY_JSON}`);
  console.log(`   Owner supremacy Markdown: ${OWNER_SUPREMACY_MARKDOWN}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to orchestrate Alpha-Meta full pipeline:", error);
    process.exitCode = 1;
  });
}
