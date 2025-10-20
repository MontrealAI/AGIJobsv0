import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { createHash } from "crypto";

import { readManifest, updateManifest, type ManifestDocument } from "./utils/manifest";

const REPORT_DIR = path.join(path.resolve(__dirname, ".."), "reports");
const DEFAULT_MANIFEST = path.join(REPORT_DIR, "alpha-meta-manifest.json");
const AUDIT_JSON = path.join(REPORT_DIR, "alpha-meta-manifest-audit.json");
const AUDIT_MARKDOWN = path.join(REPORT_DIR, "alpha-meta-manifest-audit.md");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const REQUIRED_PATHS = [
  "demo/alpha-meta/config/mission@alpha-meta.json",
  "demo/alpha-meta/reports/alpha-meta-ci-verification.json",
  "demo/alpha-meta/reports/alpha-meta-full-run.json",
  "demo/alpha-meta/reports/alpha-meta-full-run.md",
  "demo/alpha-meta/reports/alpha-meta-governance-dashboard.html",
  "demo/alpha-meta/reports/alpha-meta-governance-report.md",
  "demo/alpha-meta/reports/alpha-meta-governance-summary.json",
  "demo/alpha-meta/reports/alpha-meta-governance-validation.json",
  "demo/alpha-meta/reports/alpha-meta-governance-validation.md",
  "demo/alpha-meta/reports/alpha-meta-owner-diagnostics.json",
  "demo/alpha-meta/reports/alpha-meta-owner-diagnostics.md",
  "demo/alpha-meta/reports/alpha-meta-owner-matrix.json",
  "demo/alpha-meta/reports/alpha-meta-owner-matrix.md",
  "demo/alpha-meta/reports/alpha-meta-triangulation.json",
  "demo/alpha-meta/reports/alpha-meta-triangulation.md",
];

const AUDIT_OUTPUTS = [
  "demo/alpha-meta/reports/alpha-meta-manifest-audit.json",
  "demo/alpha-meta/reports/alpha-meta-manifest-audit.md",
];

type EntryDiagnostic = {
  path: string;
  exists: boolean;
  recordedBytes?: number;
  actualBytes?: number;
  recordedSha256?: string;
  actualSha256?: string;
  hashMatches?: boolean;
  sizeMatches?: boolean;
  error?: string;
};

type AuditCheck = {
  id: string;
  label: string;
  passed: boolean;
  details: string;
};

type DiagnosticSnapshot = {
  diagnostics: EntryDiagnostic[];
  missingRequiredPaths: string[];
  missingFiles: string[];
  mismatchedHashes: string[];
  mismatchedSizes: string[];
};

type AuditResult = {
  generatedAt: string;
  manifestPath: string;
  root: string;
  refresh: {
    attempted: boolean;
    error?: string;
  };
  initial: DiagnosticSnapshot;
  final: DiagnosticSnapshot;
  checks: AuditCheck[];
  success: boolean;
  outputs: {
    json: string;
    markdown: string;
  };
};

export interface AuditOptions {
  manifestFile?: string;
  requiredPaths?: string[];
  outputJson?: string;
  outputMarkdown?: string;
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return value.toLocaleString();
}

async function computeEntryDiagnostic(
  root: string,
  entryPath: string,
  recordedBytes?: number,
  recordedSha256?: string,
): Promise<EntryDiagnostic> {
  const absolutePath = path.resolve(root, entryPath);
  const diagnostic: EntryDiagnostic = {
    path: entryPath,
    exists: false,
    recordedBytes,
    recordedSha256,
  };

  try {
    const stats = await stat(absolutePath);
    if (!stats.isFile()) {
      diagnostic.error = "Not a file";
      return diagnostic;
    }
    diagnostic.exists = true;
    diagnostic.actualBytes = stats.size;
    const buffer = await readFile(absolutePath);
    diagnostic.actualSha256 = createHash("sha256").update(buffer).digest("hex");
    diagnostic.hashMatches = recordedSha256 ? diagnostic.actualSha256 === recordedSha256 : undefined;
    diagnostic.sizeMatches = recordedBytes !== undefined ? recordedBytes === stats.size : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      diagnostic.error = "File missing";
      return diagnostic;
    }
    diagnostic.error = (error as Error).message;
  }

  return diagnostic;
}

async function captureDiagnostics(
  manifest: ManifestDocument,
  root: string,
  requiredPaths: string[],
): Promise<DiagnosticSnapshot> {
  const diagnostics: EntryDiagnostic[] = [];
  const entryMap = new Map<string, EntryDiagnostic>();

  for (const entry of manifest.entries) {
    const diagnostic = await computeEntryDiagnostic(root, entry.path, entry.bytes, entry.sha256);
    diagnostics.push(diagnostic);
    entryMap.set(entry.path, diagnostic);
  }

  const missingRequiredPaths = requiredPaths.filter((required) => !entryMap.has(required));
  const missingFiles = diagnostics.filter((diagnostic) => !diagnostic.exists).map((diagnostic) => diagnostic.path);
  const mismatchedHashes = diagnostics
    .filter((diagnostic) => diagnostic.hashMatches === false)
    .map((diagnostic) => diagnostic.path);
  const mismatchedSizes = diagnostics
    .filter((diagnostic) => diagnostic.sizeMatches === false)
    .map((diagnostic) => diagnostic.path);

  return {
    diagnostics,
    missingRequiredPaths,
    missingFiles,
    mismatchedHashes,
    mismatchedSizes,
  };
}

function buildCheck(id: string, label: string, passed: boolean, details: string): AuditCheck {
  return { id, label, passed, details };
}

export async function auditManifest(options: AuditOptions = {}): Promise<AuditResult> {
  const manifestPath = path.resolve(options.manifestFile ?? DEFAULT_MANIFEST);
  const initialManifest = await readManifest(manifestPath);
  if (!initialManifest) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const requiredPaths = options.requiredPaths ?? REQUIRED_PATHS;
  const root = initialManifest.root ? path.resolve(initialManifest.root) : REPO_ROOT;

  const initialDiagnostics = await captureDiagnostics(initialManifest, root, requiredPaths);

  const requiredAbsolute = requiredPaths.map((relative) => path.resolve(root, relative));
  const auditAbsolute = AUDIT_OUTPUTS.map((relative) => path.resolve(root, relative));

  let refreshError: string | undefined;
  let refreshedManifest: ManifestDocument = initialManifest;
  try {
    refreshedManifest = await updateManifest(
      manifestPath,
      [...requiredAbsolute, ...auditAbsolute],
      { defaultRoot: root },
    );
  } catch (error) {
    refreshError = (error as Error).message;
  }

  const finalManifest = (await readManifest(manifestPath)) ?? refreshedManifest;
  const finalRoot = finalManifest.root ? path.resolve(finalManifest.root) : root;
  const finalDiagnostics = await captureDiagnostics(finalManifest, finalRoot, requiredPaths);

  const checks: AuditCheck[] = [];
  checks.push(
    buildCheck(
      "auto-refresh",
      "Manifest refreshed with required artefacts",
      refreshError === undefined,
      refreshError ? `Refresh error: ${refreshError}` : "Manifest hashes synchronised",
    ),
  );
  checks.push(
    buildCheck(
      "entry-count",
      "Manifest entry count matches",
      finalManifest.files === finalManifest.entries.length,
      `Manifest reports ${finalManifest.files} files, actual entries ${finalManifest.entries.length}`,
    ),
  );
  checks.push(
    buildCheck(
      "required-paths",
      "All required paths present",
      finalDiagnostics.missingRequiredPaths.length === 0,
      finalDiagnostics.missingRequiredPaths.length === 0
        ? "All required artefacts recorded"
        : `Missing ${finalDiagnostics.missingRequiredPaths.length} required artefacts`,
    ),
  );
  checks.push(
    buildCheck(
      "hash-consistency",
      "Recorded SHA-256 digests match",
      finalDiagnostics.mismatchedHashes.length === 0,
      finalDiagnostics.mismatchedHashes.length === 0
        ? "All hashes verified"
        : `Mismatched hashes for ${finalDiagnostics.mismatchedHashes.length} artefacts`,
    ),
  );
  checks.push(
    buildCheck(
      "size-consistency",
      "Recorded byte sizes match",
      finalDiagnostics.mismatchedSizes.length === 0,
      finalDiagnostics.mismatchedSizes.length === 0
        ? "All byte sizes verified"
        : `Mismatched sizes for ${finalDiagnostics.mismatchedSizes.length} artefacts`,
    ),
  );
  checks.push(
    buildCheck(
      "file-availability",
      "All manifest entries exist",
      finalDiagnostics.missingFiles.length === 0,
      finalDiagnostics.missingFiles.length === 0
        ? "All files present"
        : `Missing ${finalDiagnostics.missingFiles.length} manifest artefacts`,
    ),
  );

  const hasAuditOutputs = AUDIT_OUTPUTS.every((relativePath) =>
    finalManifest.entries.some((entry) => entry.path === relativePath),
  );
  checks.push(
    buildCheck(
      "audit-recorded",
      "Audit artefacts registered in manifest",
      hasAuditOutputs,
      hasAuditOutputs ? "Audit JSON/Markdown recorded" : "Audit outputs missing from manifest",
    ),
  );

  const outputs = {
    json: path.resolve(options.outputJson ?? AUDIT_JSON),
    markdown: path.resolve(options.outputMarkdown ?? AUDIT_MARKDOWN),
  };

  const auditResult: AuditResult = {
    generatedAt: new Date().toISOString(),
    manifestPath,
    root: finalRoot,
    refresh: {
      attempted: true,
      error: refreshError,
    },
    initial: initialDiagnostics,
    final: finalDiagnostics,
    checks,
    success: checks.every((check) => check.passed),
    outputs,
  };

  await mkdir(path.dirname(outputs.json), { recursive: true });
  await writeFile(outputs.json, JSON.stringify(auditResult, null, 2), "utf8");

  const lines: string[] = [];
  lines.push("# Alpha-Meta Manifest Audit");
  lines.push(`*Generated at:* ${auditResult.generatedAt}`);
  lines.push(`*Manifest:* \`${auditResult.manifestPath}\``);
  lines.push("");
  lines.push("## Checks");
  lines.push("| Check | Status | Details |");
  lines.push("| --- | --- | --- |");
  for (const check of auditResult.checks) {
    const emoji = check.passed ? "✅" : "❌";
    lines.push(`| ${check.label} | ${emoji} | ${check.details} |`);
  }
  lines.push("");
  lines.push("## Initial diagnostics");
  lines.push("| Path | Exists | Bytes (recorded → actual) | SHA-256 (recorded → actual) | Note |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const diagnostic of auditResult.initial.diagnostics) {
    const exists = diagnostic.exists ? "✅" : "❌";
    const size = `${formatNumber(diagnostic.recordedBytes)} → ${formatNumber(diagnostic.actualBytes)}`;
    const hash = `${diagnostic.recordedSha256 ?? "-"} → ${diagnostic.actualSha256 ?? "-"}`;
    const note = diagnostic.error ?? "";
    lines.push(`| \`${diagnostic.path}\` | ${exists} | ${size} | ${hash} | ${note} |`);
  }
  lines.push("");
  lines.push("## Final diagnostics");
  lines.push("| Path | Exists | Bytes (recorded → actual) | SHA-256 (recorded → actual) | Note |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const diagnostic of auditResult.final.diagnostics) {
    const exists = diagnostic.exists ? "✅" : "❌";
    const size = `${formatNumber(diagnostic.recordedBytes)} → ${formatNumber(diagnostic.actualBytes)}`;
    const hash = `${diagnostic.recordedSha256 ?? "-"} → ${diagnostic.actualSha256 ?? "-"}`;
    const note = diagnostic.error ?? "";
    lines.push(`| \`${diagnostic.path}\` | ${exists} | ${size} | ${hash} | ${note} |`);
  }
  if (auditResult.initial.mismatchedHashes.length > 0 || auditResult.initial.mismatchedSizes.length > 0) {
    lines.push("");
    lines.push("### Initial discrepancies");
    if (auditResult.initial.mismatchedHashes.length > 0) {
      lines.push("**Mismatched hashes (before refresh):**");
      for (const mismatch of auditResult.initial.mismatchedHashes) {
        lines.push(`- \`${mismatch}\``);
      }
    }
    if (auditResult.initial.mismatchedSizes.length > 0) {
      lines.push("**Mismatched byte sizes (before refresh):**");
      for (const mismatch of auditResult.initial.mismatchedSizes) {
        lines.push(`- \`${mismatch}\``);
      }
    }
  }
  lines.push("");
  lines.push("## Manifest coverage");
  lines.push(
    hasAuditOutputs
      ? "Audit artefacts are recorded in the manifest."
      : "Audit artefacts missing from manifest after refresh.",
  );

  await writeFile(outputs.markdown, lines.join("\n"), "utf8");

  return auditResult;
}

async function main(): Promise<void> {
  const result = await auditManifest();
  if (!result.success) {
    console.error("❌ Alpha-Meta manifest audit detected issues.");
    result.checks
      .filter((check) => !check.passed)
      .forEach((check) => console.error(`   - ${check.label}: ${check.details}`));
    process.exitCode = 1;
    return;
  }
  console.log("✅ Alpha-Meta manifest audit passed.");
  console.log(`   JSON: ${result.outputs.json}`);
  console.log(`   Markdown: ${result.outputs.markdown}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to audit Alpha-Meta manifest:", error);
    process.exitCode = 1;
  });
}
