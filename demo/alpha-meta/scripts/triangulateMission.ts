import { constants } from "fs";
import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import {
  validateGovernanceDemo,
  type ValidationReport,
} from "../../agi-governance/scripts/validateReport";
import {
  verifyCiShield,
  assessCiShield,
} from "../../agi-governance/scripts/verifyCiStatus";
import {
  collectOwnerDiagnostics,
  type AggregatedReport,
} from "../../agi-governance/scripts/collectOwnerDiagnostics";

const BASE_DIR = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const MISSION_FILE = path.join(BASE_DIR, "config", "mission@alpha-meta.json");
const SUMMARY_FILE = path.join(REPORT_DIR, "alpha-meta-governance-summary.json");
const VALIDATION_FILE = path.join(REPORT_DIR, "alpha-meta-governance-validation.json");
const CI_FILE = path.join(REPORT_DIR, "alpha-meta-ci-verification.json");
const OWNER_FILE = path.join(REPORT_DIR, "alpha-meta-owner-diagnostics.json");
const OWNER_MARKDOWN_FILE = path.join(REPORT_DIR, "alpha-meta-owner-diagnostics.md");
const FULL_RUN_FILE = path.join(REPORT_DIR, "alpha-meta-full-run.json");
const OUTPUT_JSON = path.join(REPORT_DIR, "alpha-meta-triangulation.json");
const OUTPUT_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-triangulation.md");

interface FileHash {
  path: string;
  exists: boolean;
  hash?: string;
}

interface TriangulationNote {
  severity: "info" | "warning" | "error";
  message: string;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
}

async function computeFileHash(filePath: string): Promise<FileHash> {
  try {
    await access(filePath, constants.F_OK);
  } catch {
    return { path: filePath, exists: false };
  }

  const raw = await readFile(filePath);
  const hash = createHash("sha256").update(raw).digest("hex");
  return { path: filePath, exists: true, hash };
}

function hashObject(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function validationSignature(source: ValidationReport | Record<string, unknown>): unknown {
  const report = source as ValidationReport & Record<string, unknown>;
  const results = Array.isArray(report.results)
    ? report.results.map((result) => ({
        id: result.id,
        passed: result.passed,
        details: result.details,
        delta: result.delta,
        tolerance: result.tolerance,
      }))
    : [];
  return {
    missionVersion: report.missionVersion,
    summaryTimestamp: report.summaryTimestamp,
    totals: report.totals,
    notes: report.notes,
    results,
  };
}

function ownerSignature(source: AggregatedReport | Record<string, unknown>): unknown {
  const report = source as AggregatedReport & Record<string, unknown>;
  const results = Array.isArray(report.results)
    ? report.results.map((result) => ({
        id: result.id,
        severity: result.severity,
        exitCode: result.exitCode,
        summary: result.summary,
        statuses: Array.isArray(result.statuses)
          ? result.statuses.map((status) => ({
              path: status.path,
              status: status.status,
              reason: status.reason ?? null,
            }))
          : [],
      }))
    : [];
  return {
    readiness: report.readiness,
    totals: report.totals,
    results,
  };
}

async function loadJson(filePath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function buildMermaidDiagram(hashes: {
  summary: FileHash;
  validation: { computed: string; disk: FileHash; consistent: boolean };
  ci: { computed: string; disk: FileHash; consistent: boolean; ok: boolean };
  owner: { computed: string; disk: FileHash; consistent: boolean; warnings: number; errors: number };
  fullRun: FileHash;
  digest: string;
}): string {
  const summaryLabel = hashes.summary.exists ? `Summary\\n${hashes.summary.hash}` : "Summary missing";
  const validationLabel = hashes.validation.disk.exists
    ? `Validation\\n${hashes.validation.disk.hash}`
    : "Validation missing";
  const ciLabel = hashes.ci.disk.exists ? `CI Shield\\n${hashes.ci.disk.hash}` : "CI shield missing";
  const ownerLabel = hashes.owner.disk.exists ? `Owner Diagnostics\\n${hashes.owner.disk.hash}` : "Owner diagnostics missing";
  const fullRunLabel = hashes.fullRun.exists ? `Full Run\\n${hashes.fullRun.hash}` : "Full run missing";
  const validationStatus = hashes.validation.consistent ? "consistent" : "drift";
  const ciStatus = hashes.ci.consistent && hashes.ci.ok ? "enforced" : "drift";
  const ownerStatus = hashes.owner.consistent && hashes.owner.errors === 0 ? "ready" : "attention";

  return [
    "```mermaid",
    "flowchart TD",
    `  S[${summaryLabel}]:::summary --> V{Validation ${validationStatus}}`,
    `  V -->|recomputed ${hashes.validation.computed}| VD[${validationLabel}]:::validation`,
    `  S --> C{CI Shield ${ciStatus}}`,
    `  C -->|audit ${hashes.ci.computed}| CD[${ciLabel}]:::ci`,
    `  S --> O{Owner ${ownerStatus}}`,
    `  O -->|commands ${hashes.owner.computed}| OD[${ownerLabel}]:::owner`,
    `  S --> F[${fullRunLabel}]:::fullrun`,
    `  classDef summary fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;`,
    `  classDef validation fill:${hashes.validation.consistent ? "#14532d" : "#450a0a"},stroke:#22d3ee,stroke-width:2px,color:#f8fafc;`,
    `  classDef ci fill:${hashes.ci.ok ? "#0f172a" : "#450a0a"},stroke:#facc15,stroke-width:2px,color:#f8fafc;`,
    `  classDef owner fill:${hashes.owner.errors === 0 ? "#1e1b4b" : "#450a0a"},stroke:#a855f7,stroke-width:2px,color:#f8fafc;`,
    "  classDef fullrun fill:#111827,stroke:#f472b6,stroke-width:2px,color:#fdf4ff;",
    "```",
  ].join("\n");
}

async function main(): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });

  const generatedAt = new Date().toISOString();
  const notes: TriangulationNote[] = [];

  const summaryFile = await computeFileHash(SUMMARY_FILE);
  if (!summaryFile.exists) {
    notes.push({ severity: "error", message: `Summary file missing at ${SUMMARY_FILE}. Run the demo pipeline first.` });
  }

  const validationReport = await validateGovernanceDemo({ missionFile: MISSION_FILE, summaryFile: SUMMARY_FILE });
  const validationSignatureObject = validationSignature(validationReport);
  const validationHash = hashObject(validationSignatureObject);
  const validationDisk = await computeFileHash(VALIDATION_FILE);
  let validationConsistent = true;
  if (validationDisk.exists) {
    try {
      const diskPayload = validationSignature(await loadJson(VALIDATION_FILE));
      const diskHash = hashObject(diskPayload);
      validationConsistent = diskHash === validationHash;
      if (!validationConsistent) {
        notes.push({
          severity: "error",
          message: "Validation drift detected. Recomputed metrics diverge from stored validation report.",
        });
      }
    } catch (error) {
      validationConsistent = false;
      notes.push({ severity: "error", message: `Failed to parse validation report at ${VALIDATION_FILE}: ${String(error)}` });
    }
  } else {
    notes.push({ severity: "warning", message: `Validation file missing. Expected at ${VALIDATION_FILE}.` });
    validationConsistent = false;
  }

  if (validationReport.totals.failed > 0) {
    notes.push({ severity: "error", message: `${validationReport.totals.failed} validation checks failed.` });
  }

  const { ciConfig, verification } = await verifyCiShield({ missionFile: MISSION_FILE, outputFile: CI_FILE });
  const ciAssessment = assessCiShield(ciConfig, verification);
  const ciHash = hashObject({ ciConfig, verification });
  const ciDisk = await computeFileHash(CI_FILE);
  let ciConsistent = true;
  if (ciDisk.exists) {
    try {
      const diskPayload = await loadJson(CI_FILE);
      ciConsistent = hashObject(diskPayload) === ciHash;
      if (!ciConsistent) {
        notes.push({ severity: "warning", message: "CI verification file changed since last run." });
      }
    } catch (error) {
      ciConsistent = false;
      notes.push({ severity: "error", message: `Failed to parse CI verification report at ${CI_FILE}: ${String(error)}` });
    }
  } else {
    ciConsistent = false;
    notes.push({ severity: "warning", message: `CI verification file missing. Expected at ${CI_FILE}.` });
  }

  if (!ciAssessment.ok) {
    for (const issue of ciAssessment.issues) {
      notes.push({ severity: "error", message: `CI shield issue: ${issue}` });
    }
  }

  const ownerReport = await collectOwnerDiagnostics({
    silent: true,
    missionFile: MISSION_FILE,
    jsonFile: OWNER_FILE,
    markdownFile: OWNER_MARKDOWN_FILE,
    reportDir: REPORT_DIR,
    offline: true,
  });
  const ownerSignatureObject = ownerSignature(ownerReport);
  const ownerHash = hashObject(ownerSignatureObject);
  const ownerDisk = await computeFileHash(OWNER_FILE);
  let ownerConsistent = true;
  if (ownerDisk.exists) {
    try {
      const diskPayload = ownerSignature(await loadJson(OWNER_FILE));
      ownerConsistent = hashObject(diskPayload) === ownerHash;
      if (!ownerConsistent) {
        notes.push({ severity: "warning", message: "Owner diagnostics output changed compared to stored artefact." });
      }
    } catch (error) {
      ownerConsistent = false;
      notes.push({ severity: "error", message: `Failed to parse owner diagnostics at ${OWNER_FILE}: ${String(error)}` });
    }
  } else {
    ownerConsistent = false;
    notes.push({ severity: "warning", message: `Owner diagnostics file missing. Expected at ${OWNER_FILE}.` });
  }

  if (ownerReport.totals.error > 0) {
    notes.push({ severity: "error", message: `${ownerReport.totals.error} owner diagnostic commands failed.` });
  }
  if (ownerReport.totals.warning > 0) {
    notes.push({ severity: "warning", message: `${ownerReport.totals.warning} owner diagnostic commands reported warnings.` });
  }

  const fullRun = await computeFileHash(FULL_RUN_FILE);
  if (!fullRun.exists) {
    notes.push({ severity: "warning", message: `Full pipeline artefact missing at ${FULL_RUN_FILE}. Run demo:alpha-meta:full first.` });
  }

  const triangulation = {
    generatedAt,
    missionFile: MISSION_FILE,
    artefacts: {
      summary: summaryFile,
      validation: { computedHash: validationHash, disk: validationDisk, consistent: validationConsistent },
      ci: { computedHash: ciHash, disk: ciDisk, consistent: ciConsistent, ok: ciAssessment.ok, issues: ciAssessment.issues },
      owner: {
        computedHash: ownerHash,
        disk: ownerDisk,
        consistent: ownerConsistent,
        totals: ownerReport.totals,
        readiness: ownerReport.readiness,
      },
      fullRun,
    },
    validationTotals: validationReport.totals,
    ownerTotals: ownerReport.totals,
    ownerReadiness: ownerReport.readiness,
    notes,
  };

  const digest = hashObject(triangulation);
  const hashes = {
    summary: summaryFile,
    validation: { computed: validationHash, disk: validationDisk, consistent: validationConsistent },
    ci: { computed: ciHash, disk: ciDisk, consistent: ciConsistent, ok: ciAssessment.ok },
    owner: {
      computed: ownerHash,
      disk: ownerDisk,
      consistent: ownerConsistent,
      warnings: ownerReport.totals.warning,
      errors: ownerReport.totals.error,
    },
    fullRun,
    digest,
  };

  const markdownSections = [
    "# Alpha-Meta Triangulation Ledger",
    "",
    `- Generated: ${generatedAt}`,
    `- Mission file: ${MISSION_FILE}`,
    `- Digest: \`${digest}\``,
    "",
    "## Hash Register",
    "",
    "| Artefact | Exists | SHA-256 | Consistent |",
    "| --- | --- | --- | --- |",
    `| Summary | ${summaryFile.exists ? "Yes" : "No"} | ${summaryFile.hash ?? "n/a"} | n/a |`,
    `| Validation | ${validationDisk.exists ? "Yes" : "No"} | ${validationDisk.hash ?? "n/a"} | ${validationConsistent ? "Yes" : "No"} |`,
    `| CI Shield | ${ciDisk.exists ? "Yes" : "No"} | ${ciDisk.hash ?? "n/a"} | ${ciConsistent ? "Yes" : "No"} |`,
    `| Owner Diagnostics | ${ownerDisk.exists ? "Yes" : "No"} | ${ownerDisk.hash ?? "n/a"} | ${ownerConsistent ? "Yes" : "No"} |`,
    `| Full Run | ${fullRun.exists ? "Yes" : "No"} | ${fullRun.hash ?? "n/a"} | n/a |`,
    "",
    "## Systems Cohesion Diagram",
    "",
    buildMermaidDiagram(hashes),
    "",
    "## Notes",
    "",
  ];

  if (notes.length === 0) {
    markdownSections.push("All triangulation checks succeeded. Stored artefacts match recomputed results.");
  } else {
    for (const note of notes) {
      markdownSections.push(`- **${note.severity.toUpperCase()}**: ${note.message}`);
    }
  }

  await writeFile(OUTPUT_JSON, JSON.stringify({ ...triangulation, digest }, null, 2), "utf8");
  await writeFile(OUTPUT_MARKDOWN, markdownSections.join("\n"), "utf8");

  console.log("✅ Alpha-Meta triangulation complete.");
  console.log(`   JSON: ${OUTPUT_JSON}`);
  console.log(`   Markdown: ${OUTPUT_MARKDOWN}`);

  const hasError = notes.some((note) => note.severity === "error");
  const hasWarning = notes.some((note) => note.severity === "warning");

  if (hasError) {
    console.error("❌ Triangulation detected blocking issues. Review the notes above.");
    process.exitCode = 1;
    return;
  }

  if (hasWarning) {
    console.warn("⚠️ Triangulation completed with warnings. Review the notes in the markdown report.");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to execute Alpha-Meta triangulation:", error);
    process.exitCode = 1;
  });
}
