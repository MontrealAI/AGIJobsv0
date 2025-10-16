import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { z } from "zod";

const REPORT_DIR = path.join(__dirname, "..", "reports");
const RECAP_PATH = path.join(REPORT_DIR, "alpha-mark-recap.json");
const TIMELINE_PATH = path.join(REPORT_DIR, "alpha-mark-timeline.md");

const timelineEntrySchema = z
  .object({
    order: z.number(),
    phase: z.string(),
    title: z.string(),
    description: z.string(),
    icon: z.string().optional(),
    actor: z.string().optional(),
    actorLabel: z.string().optional(),
  })
  .passthrough();

const recapSchema = z
  .object({
    generatedAt: z.string(),
    network: z
      .object({
        label: z.string(),
        name: z.string(),
        chainId: z.string(),
      })
      .passthrough(),
    orchestrator: z
      .object({
        commit: z.string().optional(),
        branch: z.string().optional(),
        mode: z.enum(["dry-run", "broadcast"]),
      })
      .passthrough(),
    timeline: z.array(timelineEntrySchema).nonempty("Timeline is empty – run the demo first."),
  })
  .passthrough();

type TimelineEntry = z.infer<typeof timelineEntrySchema>;

function sanitizeMermaid(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/:/g, "\\:");
}

function shortenAddress(address: string | undefined): string | undefined {
  if (!address) return undefined;
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function buildMermaid(entries: TimelineEntry[]): string {
  const lines = ["timeline", "    title α-AGI MARK Mission Timeline"];
  let currentPhase: string | undefined;

  for (const entry of entries) {
    const phase = entry.phase || "Mission";
    if (phase !== currentPhase) {
      lines.push(`    section ${phase}`);
      currentPhase = phase;
    }
    const icon = entry.icon ? `${entry.icon} ` : "";
    const actor = entry.actorLabel || shortenAddress(entry.actor);
    const actorSuffix = actor ? ` (${actor})` : "";
    lines.push(`      ${sanitizeMermaid(`${icon}${entry.title}${actorSuffix}`)} : ${sanitizeMermaid(entry.description)}`);
  }

  return lines.join("\n");
}

function buildTable(entries: TimelineEntry[]): string {
  const header = `| # | Phase | Event | Details | Actor |\n|:-:|:------|:------|:--------|:------|`;
  const rows = entries
    .map((entry) => {
      const label = entry.icon ? `${entry.icon} ${entry.title}` : entry.title;
      const actor = entry.actorLabel || shortenAddress(entry.actor) || "—";
      return `| ${entry.order} | ${entry.phase} | ${label} | ${entry.description} | ${actor} |`;
    })
    .join("\n");
  return `${header}\n${rows}`;
}

async function main() {
  const raw = await readFile(RECAP_PATH, "utf8");
  const recap = recapSchema.parse(JSON.parse(raw));

  const mermaid = buildMermaid(recap.timeline);
  const table = buildTable(recap.timeline);
  const generatedAt = new Date(recap.generatedAt).toISOString();
  const networkLabel = recap.network.label;
  const commitLabel = recap.orchestrator.commit ?? "(unavailable)";
  const branchLabel = recap.orchestrator.branch ?? "(unavailable)";

  const markdown = `# α-AGI MARK Mission Timeline\n\n` +
    `Generated ${generatedAt} on ${networkLabel}.\n\n` +
    `- **Orchestrator mode:** ${recap.orchestrator.mode}\n` +
    `- **Commit:** ${commitLabel}\n` +
    `- **Branch:** ${branchLabel}\n\n` +
    `## Cinematic Timeline\n\n` +
    "```mermaid\n" +
    `${mermaid}\n` +
    "```\n\n" +
    `## Event Ledger\n\n${table}\n`;

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(TIMELINE_PATH, markdown, "utf8");

  console.log(`Mission timeline written to ${TIMELINE_PATH}`);
}

main().catch((error) => {
  console.error("Failed to generate mission timeline:", error);
  process.exitCode = 1;
});
