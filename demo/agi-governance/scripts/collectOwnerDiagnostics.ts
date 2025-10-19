import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { performance } from "perf_hooks";

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const REPORT_DIR = path.join(__dirname, "..", "reports");
export const JSON_REPORT = path.join(REPORT_DIR, "owner-diagnostics.json");
export const MARKDOWN_REPORT = path.join(REPORT_DIR, "owner-diagnostics.md");

const COMMANDS = [
  {
    id: "hamiltonian",
    script: "owner:audit-hamiltonian",
    args: ["--json"],
    description: "Hamiltonian monitor ↔ mission manifest alignment",
  },
  {
    id: "rewardEngine",
    script: "reward-engine:report",
    args: ["--json"],
    description: "Reward engine treasury / thermodynamic calibration",
  },
  {
    id: "upgradeStatus",
    script: "owner:upgrade-status",
    args: ["--json"],
    description: "Timelock governance queue readiness",
  },
  {
    id: "compliance",
    script: "owner:compliance-report",
    args: ["--json"],
    description: "Tax policy disclosure + acknowledgement status",
  },
] as const;

type CommandSpec = (typeof COMMANDS)[number];

type StatusProbe = {
  path: string;
  status: string;
  reason?: string;
};

type Severity = "success" | "warning" | "error";

type CommandResult = {
  id: CommandSpec["id"];
  description: string;
  script: string;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  parsed?: unknown;
  parseError?: string;
  statuses: StatusProbe[];
  notes: string[];
  severity: Severity;
  summary: string;
};

export type AggregatedReport = {
  generatedAt: string;
  results: CommandResult[];
  totals: Record<Severity, number> & { overall: number };
  readiness: "ready" | "attention" | "blocked";
};

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function extractJson(stdout: string): { data?: unknown; error?: string } {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }

  const attempts = new Set<string>();
  attempts.add(trimmed);

  const lines = trimmed.split(/\r?\n/);
  let matched = false;
  for (let i = 0; i < lines.length; i += 1) {
    const candidateLine = lines[i].trimStart();
    if (candidateLine.startsWith("{")) {
      attempts.add(lines.slice(i).join("\n"));
      matched = true;
      break;
    }
  }
  if (!matched) {
    for (let i = 0; i < lines.length; i += 1) {
      const candidateLine = lines[i].trimStart();
      if (candidateLine.startsWith("[")) {
        attempts.add(lines.slice(i).join("\n"));
        break;
      }
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    attempts.add(trimmed.slice(firstBrace, lastBrace + 1));
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    attempts.add(trimmed.slice(firstBracket, lastBracket + 1));
  }

  for (const candidate of attempts) {
    try {
      return { data: JSON.parse(candidate) };
    } catch (error) {
      // continue trying next slice
    }
  }

  return { error: "Failed to parse JSON payload." };
}

function collectStatuses(value: unknown, pathRef = "$", seen = new WeakSet<object>()): StatusProbe[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  const probes: StatusProbe[] = [];
  const record = value as Record<string, unknown>;
  if (typeof record.status === "string") {
    probes.push({
      path: pathRef,
      status: record.status,
      reason: typeof record.reason === "string" ? record.reason : undefined,
    });
  }

  for (const [key, nested] of Object.entries(record)) {
    if (nested && typeof nested === "object") {
      probes.push(...collectStatuses(nested, `${pathRef}.${key}`, seen));
    }
  }

  return probes;
}

function escalate(current: Severity, incoming: Severity): Severity {
  const order: Severity[] = ["success", "warning", "error"];
  return order[Math.max(order.indexOf(current), order.indexOf(incoming))];
}

function normaliseReason(text?: string): string | undefined {
  if (!text) {
    return undefined;
  }
  return text.replace(/\s+/g, " ").trim();
}

function determineSeverity(
  result: CommandResult,
  payload: unknown | undefined,
  parseError?: string,
): { severity: Severity; notes: string[]; summary: string } {
  const notes: string[] = [];
  let severity: Severity = "success";

  if (result.exitCode !== 0) {
    severity = "error";
    const detail = result.stderr.trim() || `Process exited with code ${result.exitCode}`;
    notes.push(detail);
    return { severity, notes, summary: detail.slice(0, 160) };
  }

  if (!payload) {
    if (parseError) {
      severity = "warning";
      notes.push(parseError);
      return { severity, notes, summary: parseError };
    }
    return { severity: "success", notes, summary: "Command executed without JSON payload." };
  }

  if (typeof payload !== "object" || payload === null) {
    severity = "warning";
    notes.push("Unexpected JSON payload (non-object).");
    return { severity, notes, summary: "Unexpected JSON structure." };
  }

  const probes = collectStatuses(payload);
  let summary = "All subsystems reported OK.";
  if (probes.length > 0) {
    const summaries: string[] = [];
    for (const probe of probes) {
      const normalizedReason = normaliseReason(probe.reason);
      if (probe.status.toLowerCase() === "error") {
        const reason = normalizedReason ?? "error reported";
        if (normalizedReason && /HH700|artifact/i.test(normalizedReason)) {
          severity = escalate(severity, "warning");
          notes.push(`${probe.path}: ${reason}`);
        } else {
          severity = escalate(severity, "error");
          notes.push(`${probe.path}: ${reason}`);
        }
      } else if (probe.status.toLowerCase() === "skipped") {
        severity = escalate(severity, "warning");
        notes.push(`${probe.path}: skipped${normalizedReason ? ` — ${normalizedReason}` : ""}`);
      } else {
        notes.push(`${probe.path}: ${probe.status}`);
      }
      summaries.push(
        normalizedReason
          ? `${probe.status.toUpperCase()} @ ${probe.path}${normalizedReason ? ` — ${normalizedReason}` : ""}`
          : `${probe.status.toUpperCase()} @ ${probe.path}`,
      );
    }
    summary = summaries.join(" | ");
  }

  const record = payload as Record<string, unknown>;
  const crossChecks = record.crossChecks as Record<string, unknown> | undefined;
  if (crossChecks) {
    const mismatches: string[] = [];
    if (crossChecks.configMatchesMission === false) {
      severity = escalate(severity, "warning");
      mismatches.push("mission alignment");
    }
    if (crossChecks.configMatchesOnChain === false) {
      severity = escalate(severity, "warning");
      mismatches.push("on-chain alignment");
    }
    if (mismatches.length > 0) {
      const message = `Cross-check mismatch: ${mismatches.join(", ")}.`;
      notes.push(message);
      summary = `${summary} | ${message}`;
    }
  }

  const diagnostics = record.diagnostics as Record<string, unknown> | undefined;
  if (diagnostics && diagnostics.roleShareMatchesChain === false) {
    severity = escalate(severity, "warning");
    const message = "On-chain role share mismatch detected.";
    notes.push(message);
    summary = `${summary} | ${message}`;
  }

  return { severity, notes, summary };
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "n/a";
  }
  if (ms < 1_000) {
    return `${ms.toFixed(0)} ms`;
  }
  const seconds = ms / 1_000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)} s`;
  }
  const minutes = seconds / 60;
  return `${minutes.toFixed(2)} min`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function emojiForSeverity(severity: Severity): string {
  switch (severity) {
    case "success":
      return "✅";
    case "warning":
      return "⚠️";
    case "error":
    default:
      return "❌";
  }
}

function emojiForReadiness(readiness: AggregatedReport["readiness"]): string {
  switch (readiness) {
    case "ready":
      return "🟢";
    case "attention":
      return "🟡";
    case "blocked":
    default:
      return "🔴";
  }
}

function renderMarkdown(report: AggregatedReport): string {
  const lines: string[] = [];
  lines.push("# Owner Diagnostics Summary");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  const readinessLabel =
    report.readiness === "ready"
      ? "Ready — all audit surfaces reporting success."
      : report.readiness === "attention"
        ? "Attention — review warnings before production rollout."
        : "Blocked — resolve errors before proceeding.";
  lines.push(`${emojiForReadiness(report.readiness)} ${readinessLabel}`);
  lines.push("");
  lines.push("| Command | Status | Insight | Duration |");
  lines.push("| --- | --- | --- | --- |");
  for (const result of report.results) {
    const status = `${emojiForSeverity(result.severity)} ${result.severity.toUpperCase()}`;
    const insight = escapeMarkdown(result.summary);
    lines.push(`| ${escapeMarkdown(result.description)} | ${status} | ${insight} | ${formatDuration(result.durationMs)} |`);
  }
  lines.push("");
  lines.push("## Breakdown");
  lines.push("");
  lines.push(`- Success: ${report.totals.success}`);
  lines.push(`- Warning: ${report.totals.warning}`);
  lines.push(`- Error: ${report.totals.error}`);
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const result of report.results) {
    if (result.notes.length === 0) {
      continue;
    }
    lines.push(`### ${result.description}`);
    for (const note of result.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }
  lines.push("_Generated by `npm run demo:agi-governance:owner-diagnostics`._");
  lines.push("");
  return lines.join("\n");
}

async function runCommand(spec: CommandSpec): Promise<CommandResult> {
  const args = ["run", spec.script, "--", ...spec.args];
  const command = `${npmCommand()} ${["run", spec.script, "--", ...spec.args].join(" ")}`;
  return new Promise((resolve) => {
    const start = performance.now();
    const child = spawn(npmCommand(), args, {
      cwd: ROOT_DIR,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      const durationMs = performance.now() - start;
      resolve({
        id: spec.id,
        description: spec.description,
        script: spec.script,
        command,
        exitCode: null,
        stdout,
        stderr: `${stderr}${error.message}`,
        durationMs,
        parseError: "Failed to spawn npm process.",
        statuses: [],
        notes: [error.message],
        severity: "error",
        summary: error.message,
      });
    });

    child.on("close", (code) => {
      const durationMs = performance.now() - start;
      const { data, error } = extractJson(stdout);
      const statuses = collectStatuses(data);
      const baseResult: CommandResult = {
        id: spec.id,
        description: spec.description,
        script: spec.script,
        command,
        exitCode: code,
        stdout,
        stderr,
        durationMs,
        parsed: data,
        parseError: error,
        statuses,
        notes: [],
        severity: "success",
        summary: "",
      };
      const { severity, notes, summary } = determineSeverity(baseResult, data, error);
      baseResult.severity = severity;
      baseResult.notes = notes;
      baseResult.summary = summary;
      resolve(baseResult);
    });
  });
}

export async function collectOwnerDiagnostics(
  options: { silent?: boolean } = {},
): Promise<AggregatedReport> {
  const { silent = false } = options;

  await mkdir(REPORT_DIR, { recursive: true });

  const results: CommandResult[] = [];
  for (const command of COMMANDS) {
    const result = await runCommand(command);
    results.push(result);
    if (!silent) {
      const label = `${emojiForSeverity(result.severity)} [${command.script}] ${result.summary}`;
      console.log(label);
    }
  }

  const totals: AggregatedReport["totals"] = {
    success: results.filter((item) => item.severity === "success").length,
    warning: results.filter((item) => item.severity === "warning").length,
    error: results.filter((item) => item.severity === "error").length,
    overall: results.length,
  } as AggregatedReport["totals"];

  let readiness: AggregatedReport["readiness"] = "ready";
  if (totals.error > 0) {
    readiness = "blocked";
  } else if (totals.warning > 0) {
    readiness = "attention";
  }

  const report: AggregatedReport = {
    generatedAt: new Date().toISOString(),
    results,
    totals,
    readiness,
  };

  await writeFile(JSON_REPORT, JSON.stringify(report, null, 2), "utf8");
  await writeFile(MARKDOWN_REPORT, renderMarkdown(report), "utf8");

  if (!silent) {
    console.log(`JSON report: ${JSON_REPORT}`);
    console.log(`Markdown report: ${MARKDOWN_REPORT}`);
  }

  return report;
}

async function main(): Promise<void> {
  const report = await collectOwnerDiagnostics();
  if (report.readiness === "blocked") {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Failed to collect owner diagnostics:", error);
    process.exitCode = 1;
  });
}
