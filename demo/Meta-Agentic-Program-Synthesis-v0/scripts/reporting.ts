import { createHash } from "crypto";
import { readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type {
  ArchiveCell,
  CandidateRecord,
  MissionConfig,
  OwnerCapability,
  OwnerControlCoverage,
  SynthesisRun,
  TaskResult,
  TriangulationReport,
} from "./types";

function formatPercent(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(digits);
}

function formatThermoStatus(counts: { aligned: number; monitor: number; drift: number }): string {
  return `${counts.aligned} aligned / ${counts.monitor} monitor / ${counts.drift} drift`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function renderOwnerCapabilities(capabilities: OwnerCapability[]): string {
  if (capabilities.length === 0) {
    return "| Category | Command | Verification |\n| --- | --- | --- |\n| n/a | n/a | n/a |";
  }
  const rows = capabilities
    .map((capability) =>
      `| ${capability.category} | \`${capability.command}\` | \`${capability.verification}\` |`,
    )
    .join("\n");
  return `| Category | Command | Verification |\n| --- | --- | --- |\n${rows}`;
}

function renderOwnerCoverage(coverage: OwnerControlCoverage): string {
  const satisfied = coverage.satisfiedCategories.length
    ? coverage.satisfiedCategories.join(", ")
    : "None";
  const missing = coverage.missingCategories.length ? coverage.missingCategories.join(", ") : "None";
  return [
    `- **Readiness:** ${coverage.readiness}`,
    `- **Satisfied controls:** ${satisfied}`,
    `- **Missing controls:** ${missing}`,
  ].join("\n");
}

function renderOwnerCoverageHtml(coverage: OwnerControlCoverage): string {
  const satisfied = coverage.satisfiedCategories.length
    ? escapeHtml(coverage.satisfiedCategories.join(", "))
    : "None";
  const missing = coverage.missingCategories.length
    ? escapeHtml(coverage.missingCategories.join(", "))
    : "None";
  return `
<ul class="coverage">
  <li><strong>Readiness:</strong> ${escapeHtml(coverage.readiness)}</li>
  <li><strong>Satisfied controls:</strong> ${satisfied}</li>
  <li><strong>Missing controls:</strong> ${missing}</li>
</ul>`;
}

function renderTriangulationTable(report: TriangulationReport): string {
  if (report.perspectives.length === 0) {
    return "| Perspective | Verdict | Confidence | Notes |\n| --- | --- | --- | --- |\n| n/a | n/a | n/a | n/a |";
  }
  const rows = report.perspectives
    .map((perspective) => {
      const verdict = perspective.passed ? "✅" : "⚠️";
      const confidence = formatPercent(perspective.confidence, 1);
      const note = perspective.notes ? perspective.notes : "";
      return `| ${perspective.label} | ${verdict} | ${confidence} | ${note.replace(/\n/g, "<br/>")} |`;
    })
    .join("\n");
  return `| Perspective | Verdict | Confidence | Notes |\n| --- | --- | --- | --- |\n${rows}`;
}

function renderTriangulationHtml(report: TriangulationReport): string {
  const rows = report.perspectives
    .map(
      (perspective) => `
        <tr>
          <td>${escapeHtml(perspective.label)}</td>
          <td>${perspective.passed ? "✅" : "⚠️"}</td>
          <td>${formatPercent(perspective.confidence, 1)}</td>
          <td>${escapeHtml(perspective.notes ?? "")}</td>
        </tr>
      `,
    )
    .join("");
  return `
<table class="triangulation">
  <thead>
    <tr>
      <th>Perspective</th>
      <th>Verdict</th>
      <th>Confidence</th>
      <th>Notes</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`;
}

function renderTriangulationMermaid(report: TriangulationReport): string {
  const passed = report.perspectives.filter((perspective) => perspective.passed).length;
  const failed = report.perspectives.length - passed;
  return [
    "```mermaid",
    "pie title Verification consensus",
    `  \"Passed\" : ${passed}`,
    `  \"Review\" : ${Math.max(0, failed)}`,
    "```",
  ].join("\n");
}

function renderPipeline(candidate: CandidateRecord): string {
  return candidate.operations
    .map((operation, index) => `${index + 1}. ${operation.type} (${Object.entries(operation.params)
      .map(([key, value]) => `${key}=${Number.isFinite(value) ? value.toFixed(3) : "0"}`)
      .join(", ")})`)
    .join("\n");
}

function renderHistory(history: TaskResult["history"]): string {
  const header = "| Generation | Best Score | Mean Score | Diversity | Elite Score |";
  const separator = "| --- | --- | --- | --- | --- |";
  const rows = history
    .map(
      (snapshot) =>
        `| ${snapshot.generation} | ${formatNumber(snapshot.bestScore, 2)} | ${formatNumber(snapshot.meanScore, 2)} | ${formatNumber(snapshot.diversity, 2)} | ${formatNumber(snapshot.eliteScore, 2)} |`,
    )
    .join("\n");
  return [header, separator, rows].join("\n");
}

function renderArchive(archive: ArchiveCell[]): string {
  if (archive.length === 0) {
    return "| Cell | Complexity | Novelty | Energy | Score |\n| --- | --- | --- | --- | --- |\n| n/a | n/a | n/a | n/a | n/a |";
  }
  const rows = archive
    .map(
      (cell) =>
        `| ${cell.key} | ${cell.features.complexity} | ${cell.features.novelty.toFixed(2)} | ${cell.features.energy.toFixed(2)} | ${cell.candidate.metrics.score.toFixed(2)} |`,
    )
    .join("\n");
  return `| Cell | Complexity | Novelty | Energy | Score |\n| --- | --- | --- | --- | --- |\n${rows}`;
}

function renderMermaidFlow(mission: MissionConfig, run: SynthesisRun): string {
  const council = mission.meta.governance?.council?.join("\\n") ?? "Validator Council";
  const sentinels = mission.meta.governance?.sentinels?.join("\\n") ?? "Sentinel Mesh";
  const taskNodes = run.tasks
    .map((task, index) => `  Sovereign --> T${index}(${task.task.label})\n  T${index} --> QA${index}[Quality Archive ${task.archive.length}]`)
    .join("\n");
  return [
    "```mermaid",
    "flowchart LR",
    "  Owner((Non-technical Owner)):::role",
    "  Council[Governance Council\\n" + council + "]:::governance",
    "  Sentinels[Sentinel Grid\\n" + sentinels + "]:::governance",
    "  Sovereign[[Meta-Agentic Architect]]:::core",
    "  Evolution((Evolutionary Forge)):::core",
    "  Archive[Global QD Archive\\n" + run.tasks.reduce((acc, task) => acc + task.archive.length, 0) + " cells]:::archive",
    "  Owner --> Sovereign",
    "  Sovereign --> Evolution",
    taskNodes,
    "  Evolution --> Archive",
    "  Archive --> Owner",
    "  Sentinels --> Archive",
    "  Council --> Sovereign",
    "  classDef role fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;",
    "  classDef core fill:#111827,stroke:#a855f7,stroke-width:2px,color:#f5f3ff;",
    "  classDef governance fill:#1f2937,stroke:#22d3ee,stroke-width:2px,color:#e0f2fe;",
    "  classDef archive fill:#1e3a8a,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;",
    "```",
  ].join("\n");
}

function renderMermaidTimeline(task: TaskResult): string {
  const milestones = task.history.map((snapshot) => {
    const novelty = formatPercent(task.bestCandidate.metrics.novelty, 1);
    return `  ${snapshot.timestamp} : score ${formatNumber(snapshot.bestScore, 2)} • elite ${formatNumber(snapshot.eliteScore, 2)} • diversity ${formatNumber(snapshot.diversity, 2)} • novelty ${novelty}`;
  });
  return [
    "```mermaid",
    "timeline",
    "  title Evolutionary improvements for " + task.task.label,
    ...milestones,
    "```",
  ].join("\n");
}

export function renderMarkdownReport(run: SynthesisRun): string {
  const { mission } = run;
  const lines: string[] = [];
  lines.push(`# ${mission.meta.title}`);
  if (mission.meta.subtitle) {
    lines.push(`_${mission.meta.subtitle}_`);
    lines.push("");
  }
  lines.push(mission.meta.description);
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(
    `- **Global best score:** ${formatNumber(run.aggregate.globalBestScore, 2)} (accuracy ${formatPercent(run.aggregate.averageAccuracy)})`,
  );
  lines.push(`- **Energy envelope:** ${formatNumber(run.aggregate.energyUsage, 2)} average operations energy.`);
  lines.push(`- **Novelty signal:** ${formatPercent(run.aggregate.noveltyScore)} average.`);
  lines.push(`- **Coverage:** ${formatPercent(run.aggregate.coverageScore)} task-level perfect matches.`);
  lines.push(
    `- **Triangulation confidence:** ${formatPercent(run.aggregate.triangulationConfidence)} consensus ` +
      `(${run.aggregate.consensus.confirmed} confirmed / ${run.aggregate.consensus.attention} attention / ${run.aggregate.consensus.rejected} flagged).`,
  );
  lines.push(
    `- **Thermodynamic alignment:** ${formatPercent(run.aggregate.thermodynamics.averageAlignment)} ` +
      `(mean Δ ${formatNumber(run.aggregate.thermodynamics.meanDelta)} | max Δ ${formatNumber(run.aggregate.thermodynamics.maxDelta)} | ${formatThermoStatus(run.aggregate.thermodynamics.statusCounts)}).`,
  );
  lines.push(
    "- **Owner supremacy:** every control remains copy-paste accessible (pause, thermostat, upgrades, treasury mirrors, compliance dossier).",
  );
  lines.push(
    `- **Coverage readiness:** ${run.ownerCoverage.readiness} (${run.ownerCoverage.satisfiedCategories.length}/${run.ownerCoverage.requiredCategories.length} controls satisfied).`,
  );
  lines.push("");

  lines.push("## Mission Metadata");
  lines.push("");
  lines.push(`- Version: ${mission.meta.version}`);
  lines.push(`- Owner: ${mission.meta.ownerAddress}`);
  lines.push(`- Treasury: ${mission.meta.treasuryAddress}`);
  lines.push(`- Timelock: ${mission.meta.timelockSeconds} seconds`);
  if (mission.meta.governance?.ownerScripts) {
    lines.push("- Owner Control Scripts:");
    for (const script of mission.meta.governance.ownerScripts) {
      lines.push(`  - \`${script}\``);
    }
  }
  lines.push("");

  lines.push("## Meta-Agentic Control Surface");
  lines.push("");
  lines.push(renderMermaidFlow(mission, run));
  lines.push("");

  lines.push("## Verification Consensus");
  lines.push("");
  lines.push(
    `- Confirmed: ${run.aggregate.consensus.confirmed} | Attention: ${run.aggregate.consensus.attention} | Flagged: ${run.aggregate.consensus.rejected}`,
  );
  lines.push("```mermaid");
  lines.push("pie title System-wide verification consensus");
  lines.push(`  \"Confirmed\" : ${run.aggregate.consensus.confirmed}`);
  lines.push(`  \"Attention\" : ${run.aggregate.consensus.attention}`);
  lines.push(`  \"Rejected\" : ${run.aggregate.consensus.rejected}`);
  lines.push("```");
  lines.push("");

  lines.push("## Owner Capabilities");
  lines.push("");
  lines.push(renderOwnerCapabilities(mission.ownerControls.capabilities));
  lines.push("");

  lines.push("## Owner Coverage Readiness");
  lines.push("");
  lines.push(renderOwnerCoverage(run.ownerCoverage));
  lines.push("");

  for (const task of run.tasks) {
    lines.push(`## ${task.task.label}`);
    lines.push("");
    lines.push(task.task.narrative);
    lines.push("");
    lines.push(
      `- Job ID: ${task.task.owner.jobId} | Stake: ${task.task.owner.stake.toLocaleString()} | Reward: ${task.task.owner.reward.toLocaleString()} | Thermodynamic target: ${task.task.owner.thermodynamicTarget}`,
    );
    lines.push(
      `- Best candidate score: ${formatNumber(task.bestCandidate.metrics.score, 2)} (accuracy ${formatPercent(task.bestCandidate.metrics.accuracy)}, novelty ${formatPercent(task.bestCandidate.metrics.novelty, 1)}, coverage ${formatPercent(task.bestCandidate.metrics.coverage, 1)})`,
    );
    lines.push(
      `- Thermodynamic status: **${task.thermodynamics.status.toUpperCase()}** (target ${formatNumber(task.thermodynamics.target, 2)} • energy ${formatNumber(task.thermodynamics.actualEnergy, 2)} • Δ ${formatNumber(task.thermodynamics.delta, 2)} • tolerance ≤ ${formatNumber(task.thermodynamics.tolerance, 2)}).`,
    );
    lines.push("- Pipeline blueprint:");
    lines.push("```");
    lines.push(renderPipeline(task.bestCandidate));
    lines.push("```");
    lines.push("");
    lines.push("### Triangulated Verification");
    lines.push("");
    lines.push(
      `- Consensus: **${task.triangulation.consensus.toUpperCase()}** (${formatPercent(task.triangulation.confidence, 1)} confidence, ${task.triangulation.passed}/${task.triangulation.total} perspectives).`,
    );
    lines.push(renderTriangulationTable(task.triangulation));
    lines.push("");
    lines.push(renderTriangulationMermaid(task.triangulation));
    lines.push("");
    lines.push("### Evolutionary History");
    lines.push("");
    lines.push(renderHistory(task.history));
    lines.push("");
    lines.push("### Quality-Diversity Archive");
    lines.push("");
    lines.push(renderArchive(task.archive.slice(0, 12)));
    lines.push("");
    lines.push("### Evolution Timeline");
    lines.push("");
    lines.push(renderMermaidTimeline(task));
    lines.push("");
  }

  lines.push("## CI Shield Alignment");
  lines.push("");
  lines.push(
    `- Workflow: \`${mission.ci.workflow}\` | Required jobs: ${mission.ci.requiredJobs.map((job) => job.name).join(", ")}`,
  );
  lines.push(`- Coverage threshold ≥ ${mission.ci.minCoverage}% | Concurrency group \`${mission.ci.concurrency}\``);
  lines.push("");
  lines.push("## Generated At");
  lines.push("");
  lines.push(run.generatedAt);
  lines.push("");
  return lines.join("\n");
}

export function buildJsonSummary(run: SynthesisRun): Record<string, unknown> {
  return {
    generatedAt: run.generatedAt,
    mission: {
      title: run.mission.meta.title,
      version: run.mission.meta.version,
      owner: run.mission.meta.ownerAddress,
      treasury: run.mission.meta.treasuryAddress,
      timelockSeconds: run.mission.meta.timelockSeconds,
      governance: run.mission.meta.governance,
    },
    aggregate: run.aggregate,
    ownerCoverage: run.ownerCoverage,
    tasks: run.tasks.map((task) => ({
      id: task.task.id,
      label: task.task.label,
      narrative: task.task.narrative,
      metrics: task.bestCandidate.metrics,
      job: task.task.owner,
      pipeline: task.bestCandidate.operations,
      thermodynamics: task.thermodynamics,
      archive: task.archive.slice(0, 24).map((cell) => ({
        key: cell.key,
        features: cell.features,
        score: cell.candidate.metrics.score,
      })),
      history: task.history,
      triangulation: task.triangulation,
    })),
    ci: run.mission.ci,
    ownerControls: run.mission.ownerControls,
  };
}

export function buildTriangulationDigest(run: SynthesisRun): Record<string, unknown> {
  return {
    generatedAt: run.generatedAt,
    confidence: run.aggregate.triangulationConfidence,
    consensus: run.aggregate.consensus,
    tasks: run.tasks.map((task) => ({
      id: task.task.id,
      label: task.task.label,
      consensus: task.triangulation.consensus,
      confidence: task.triangulation.confidence,
      passed: task.triangulation.passed,
      total: task.triangulation.total,
      perspectives: task.triangulation.perspectives.map((perspective) => ({
        id: perspective.id,
        label: perspective.label,
        method: perspective.method,
        passed: perspective.passed,
        confidence: perspective.confidence,
        scoreDelta: perspective.scoreDelta,
        accuracyDelta: perspective.accuracyDelta,
        noveltyDelta: perspective.noveltyDelta,
        energyDelta: perspective.energyDelta,
        notes: perspective.notes,
      })),
    })),
  };
}

export function renderHtmlDashboard(run: SynthesisRun): string {
  const summary = buildJsonSummary(run);
  const triangulationDigest = buildTriangulationDigest(run);
  const mermaidFlow = renderMermaidFlow(run.mission, run);
  const taskSections = run.tasks
    .map((task) => {
      const pipeline = escapeHtml(renderPipeline(task.bestCandidate));
      const archiveTable = renderArchive(task.archive.slice(0, 12));
      const historyTable = renderHistory(task.history);
      const timeline = renderMermaidTimeline(task);
      return `
<section class="task">
  <h2>${escapeHtml(task.task.label)}</h2>
  <p>${escapeHtml(task.task.narrative)}</p>
  <ul>
    <li><strong>Job:</strong> ${escapeHtml(task.task.owner.jobId)} | Stake: ${task.task.owner.stake.toLocaleString()} | Reward: ${task.task.owner.reward.toLocaleString()} | Thermodynamic target: ${task.task.owner.thermodynamicTarget}</li>
    <li><strong>Score:</strong> ${formatNumber(task.bestCandidate.metrics.score, 2)} | Accuracy ${formatPercent(task.bestCandidate.metrics.accuracy)} | Novelty ${formatPercent(task.bestCandidate.metrics.novelty)} | Coverage ${formatPercent(task.bestCandidate.metrics.coverage)}</li>
    <li><strong>Thermodynamics:</strong> ${escapeHtml(task.thermodynamics.status.toUpperCase())} • target ${formatNumber(task.thermodynamics.target, 2)} • energy ${formatNumber(task.thermodynamics.actualEnergy, 2)} • Δ ${formatNumber(task.thermodynamics.delta, 2)} • tolerance ≤ ${formatNumber(task.thermodynamics.tolerance, 2)}</li>
  </ul>
  <details open>
    <summary>Pipeline Blueprint</summary>
    <pre>${pipeline}</pre>
  </details>
  <details>
    <summary>Triangulated Verification</summary>
    <p><strong>Consensus:</strong> ${escapeHtml(task.triangulation.consensus)} • Confidence ${formatPercent(task.triangulation.confidence)}</p>
    <div class="table">${renderTriangulationHtml(task.triangulation)}</div>
    <pre class="mermaid">${renderTriangulationMermaid(task.triangulation).replace(/```mermaid|```/g, "").trim()}</pre>
  </details>
  <details>
    <summary>Evolutionary History</summary>
    <div class="table">${historyTable}</div>
  </details>
  <details>
    <summary>Quality-Diversity Archive</summary>
    <div class="table">${archiveTable}</div>
  </details>
  <details>
    <summary>Evolution Timeline</summary>
    <pre class="mermaid">${timeline.replace(/```mermaid|```/g, "").trim()}</pre>
  </details>
</section>`;
    })
    .join("\n");

  const ownerTable = renderOwnerCapabilities(run.mission.ownerControls.capabilities);
  const coverageHtml = renderOwnerCoverageHtml(run.ownerCoverage);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(run.mission.meta.title)}</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js" defer></script>
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        if (window.mermaid) {
          window.mermaid.initialize({ startOnLoad: true, theme: 'dark' });
        }
      });
    </script>
    <style>
      body { font-family: "Inter", "Segoe UI", sans-serif; background: #0b1120; color: #e2e8f0; margin: 0; padding: 2rem; }
      h1, h2, h3 { color: #f8fafc; }
      section { margin-bottom: 2.5rem; padding: 1.5rem; border-radius: 1rem; background: rgba(30, 64, 175, 0.35); box-shadow: 0 24px 48px rgba(15, 23, 42, 0.45); }
      ul { line-height: 1.6; }
      pre { background: rgba(15, 23, 42, 0.8); padding: 1rem; border-radius: 0.75rem; overflow-x: auto; }
      .table { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; }
      th, td { border: 1px solid rgba(148, 163, 184, 0.35); padding: 0.5rem; text-align: left; }
      thead { background: rgba(30, 41, 59, 0.75); }
      details { margin-top: 1rem; }
      summary { cursor: pointer; font-weight: 600; }
      footer { margin-top: 3rem; text-align: center; color: rgba(148, 163, 184, 0.75); }
      .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-top: 1rem; }
      .metric-card { padding: 1rem; border-radius: 0.75rem; background: rgba(15, 118, 110, 0.35); box-shadow: inset 0 0 0 1px rgba(45, 212, 191, 0.25); }
      .metric-card .metric-sub { display: block; margin-top: 0.35rem; font-size: 0.85rem; color: rgba(226, 232, 240, 0.7); }
      .owner-table { margin-top: 1rem; }
      ul.coverage { list-style: none; padding-left: 0; margin-top: 1rem; }
      ul.coverage li { margin-bottom: 0.35rem; }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(run.mission.meta.title)}</h1>
      <p>${escapeHtml(run.mission.meta.description)}</p>
      <div class="metrics">
        <div class="metric-card"><strong>Global best score</strong><br />${formatNumber(run.aggregate.globalBestScore, 2)}</div>
        <div class="metric-card"><strong>Average accuracy</strong><br />${formatPercent(run.aggregate.averageAccuracy)}</div>
        <div class="metric-card"><strong>Energy envelope</strong><br />${formatNumber(run.aggregate.energyUsage, 2)}</div>
        <div class="metric-card"><strong>Novelty signal</strong><br />${formatPercent(run.aggregate.noveltyScore)}</div>
        <div class="metric-card"><strong>Coverage</strong><br />${formatPercent(run.aggregate.coverageScore)}</div>
        <div class="metric-card"><strong>Triangulation confidence</strong><br />${formatPercent(run.aggregate.triangulationConfidence)}</div>
        <div class="metric-card"><strong>Thermodynamic alignment</strong><br />${formatPercent(run.aggregate.thermodynamics.averageAlignment)}<span class="metric-sub">Δ̄ ${formatNumber(run.aggregate.thermodynamics.meanDelta, 2)} • Δmax ${formatNumber(run.aggregate.thermodynamics.maxDelta, 2)} • ${escapeHtml(formatThermoStatus(run.aggregate.thermodynamics.statusCounts))}</span></div>
      </div>
    </header>
    <section>
      <h2>Meta-Agentic Control Surface</h2>
      <pre class="mermaid">${mermaidFlow.replace(/```mermaid|```/g, "").trim()}</pre>
    </section>
    <section>
      <h2>Verification Consensus</h2>
      <p>Confirmed ${run.aggregate.consensus.confirmed} • Attention ${run.aggregate.consensus.attention} • Flagged ${run.aggregate.consensus.rejected}</p>
      <pre class="mermaid">pie title System-wide verification consensus
  "Confirmed" : ${run.aggregate.consensus.confirmed}
  "Attention" : ${run.aggregate.consensus.attention}
  "Rejected" : ${run.aggregate.consensus.rejected}
</pre>
    </section>
    <section>
      <h2>Owner Capabilities</h2>
      <div class="table">${ownerTable}</div>
      <h3>Coverage Readiness</h3>
      ${coverageHtml}
    </section>
    ${taskSections}
    <section>
      <h2>CI Shield</h2>
      <p>Workflow <code>${escapeHtml(run.mission.ci.workflow)}</code> | Required jobs: ${run.mission.ci.requiredJobs
        .map((job) => escapeHtml(job.name))
        .join(", ")}</p>
      <p>Coverage ≥ ${run.mission.ci.minCoverage}% | Concurrency group <code>${escapeHtml(run.mission.ci.concurrency)}</code></p>
    </section>
    <footer>Generated ${escapeHtml(run.generatedAt)} • JSON summary embedded below</footer>
    <script id="meta-agentic-summary" type="application/json">${escapeHtml(JSON.stringify(summary, null, 2))}</script>
    <script id="meta-agentic-triangulation" type="application/json">${escapeHtml(JSON.stringify(triangulationDigest, null, 2))}</script>
  </body>
</html>`;
}

export async function writeReports(
  run: SynthesisRun,
  options: {
    reportDir: string;
    markdownFile: string;
    jsonFile: string;
    htmlFile: string;
    triangulationFile: string;
  },
): Promise<{ files: string[] }> {
  const { reportDir, markdownFile, jsonFile, htmlFile, triangulationFile } = options;
  await mkdir(reportDir, { recursive: true });
  const markdown = renderMarkdownReport(run);
  const summary = buildJsonSummary(run);
  const triangulation = buildTriangulationDigest(run);
  const html = renderHtmlDashboard(run);
  await writeFile(markdownFile, markdown, "utf8");
  await writeFile(jsonFile, JSON.stringify(summary, null, 2), "utf8");
  await writeFile(htmlFile, html, "utf8");
  await writeFile(triangulationFile, JSON.stringify(triangulation, null, 2), "utf8");
  return { files: [markdownFile, jsonFile, htmlFile, triangulationFile] };
}

export function generateManifest(entries: string[]): Record<string, string> {
  const manifest: Record<string, string> = {};
  for (const entry of entries) {
    const absolute = path.resolve(entry);
    const hash = createHash("sha256");
    hash.update(readFileSync(absolute));
    manifest[path.relative(process.cwd(), absolute).replace(/\\/g, "/")] = hash.digest("hex");
  }
  return manifest;
}
