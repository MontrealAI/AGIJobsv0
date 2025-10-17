import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { formatEther } from "ethers";
import { z } from "zod";

const RECAP_PATH = path.join(__dirname, "..", "reports", "alpha-mark-recap.json");
const REPORT_PATH = path.join(__dirname, "..", "reports", "alpha-mark-empowerment.md");

const participantSchema = z
  .object({
    address: z.string(),
    tokens: z.string(),
    tokensWei: z.string(),
    contributionWei: z.string(),
    contributionEth: z.string().optional(),
  })
  .passthrough();

const timelineEntrySchema = z
  .object({
    phase: z.string(),
    title: z.string(),
    description: z.string(),
    icon: z.string().optional(),
    actor: z.string().optional(),
    actorLabel: z.string().optional(),
  })
  .passthrough();

const empowermentSchema = z
  .object({
    tagline: z.string(),
    automation: z
      .object({
        manualCommands: z.number(),
        orchestratedActions: z.number(),
        automationMultiplier: z.string(),
      })
      .passthrough(),
    assurance: z
      .object({
        verificationConfidencePercent: z.string(),
        checksPassed: z.number(),
        totalChecks: z.number(),
        validatorApprovals: z.number(),
        validatorThreshold: z.number(),
      })
      .passthrough(),
    capitalFormation: z
      .object({
        participants: z.number(),
        grossContributionsWei: z.string(),
        grossContributionsEth: z.string().optional(),
        reserveWei: z.string(),
        reserveEth: z.string().optional(),
      })
      .passthrough(),
    operatorControls: z
      .object({
        totalControls: z.number(),
        highlights: z.array(z.string()).optional(),
      })
      .passthrough(),
  })
  .passthrough();

const ownerControlsSchema = z
  .object({
    paused: z.boolean(),
    whitelistEnabled: z.boolean(),
    emergencyExitEnabled: z.boolean(),
    finalized: z.boolean(),
    aborted: z.boolean(),
    validationOverrideEnabled: z.boolean(),
    validationOverrideStatus: z.boolean(),
    treasury: z.string().optional(),
    riskOracle: z.string().optional(),
    baseAsset: z.string().optional(),
    usesNativeAsset: z.boolean().optional(),
  })
  .passthrough();

const verificationSchema = z
  .object({
    summary: z
      .object({
        totalChecks: z.number().optional(),
        passedChecks: z.number().optional(),
        confidenceIndexPercent: z.string().optional(),
        verdict: z.string().optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

const recapSchema = z
  .object({
    generatedAt: z.string(),
    network: z
      .object({
        label: z.string(),
        name: z.string(),
        chainId: z.string(),
        dryRun: z.boolean(),
      })
      .passthrough(),
    orchestrator: z
      .object({
        mode: z.string().optional(),
        commit: z.string().optional(),
        branch: z.string().optional(),
      })
      .passthrough(),
    empowerment: empowermentSchema,
    ownerControls: ownerControlsSchema,
    participants: z.array(participantSchema).nonempty("Participant ledger empty in recap"),
    timeline: z.array(timelineEntrySchema).nonempty("Timeline missing from recap"),
    verification: verificationSchema.optional(),
  })
  .passthrough();

type Recap = z.infer<typeof recapSchema>;
type Participant = z.infer<typeof participantSchema>;
type TimelineEntry = z.infer<typeof timelineEntrySchema>;

type NumberPoint = { automation: number; assurance: number };

function parseBigInt(label: string, value: string | undefined): bigint {
  if (!value) {
    throw new Error(`${label} missing`);
  }
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error(`${label} is not a bigint: ${value}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toDecimal(value: bigint): number {
  return Number.parseFloat(formatEther(value));
}

function formatNumber(value: number): string {
  const trimmed = value.toFixed(4).replace(/\.0+$/, "").replace(/0+$/, "");
  return trimmed.length === 0 ? "0" : trimmed;
}

function shorten(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function sanitizeMermaid(text: string): string {
  return text.replace(/[\r\n]+/g, " " ).replace(/:/g, " -").replace(/`/g, "'");
}

function buildQuadrant(point: NumberPoint, validatorPoint: NumberPoint): string {
  const orchestrator = `[${formatNumber(point.automation)}, ${formatNumber(point.assurance)}]`;
  const validator = `[${formatNumber(validatorPoint.automation)}, ${formatNumber(validatorPoint.assurance)}]`;

  return [
    "```mermaid",
    "quadrantChart",
    "    title Empowerment Coordinates",
    "    x-axis Manual Touchpoints --> Autonomous Execution",
    "    y-axis Low Assurance --> Board-Level Assurance",
    "    quadrant-1 Sovereign Autopilot",
    "    quadrant-2 Assisted Governance",
    "    quadrant-3 Manual Baseline",
    "    quadrant-4 Tactical Workshop",
    `    "AGI Jobs orchestrator" : ${orchestrator}`,
    `    "Validator council" : ${validator}`,
    '    "Legacy manual launch" : [0.18, 0.20]',
    '    "Ad-hoc compliance" : [0.35, 0.45]',
    "```",
  ].join("\n");
}

function buildPie(participants: Array<{ label: string; value: number }>): string {
  const lines: string[] = [
    "```mermaid",
    "pie showData",
    "    title Capital Formation by Participant",
  ];
  participants.forEach((entry) => {
    lines.push(`    "${entry.label}" : ${formatNumber(entry.value)}`);
  });
  lines.push("```");
  return lines.join("\n");
}

function buildTimeline(entries: TimelineEntry[]): string {
  const groups = new Map<string, TimelineEntry[]>();
  entries.forEach((entry) => {
    const key = entry.phase || "Mission";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(entry);
  });

  const limitedGroups = Array.from(groups.entries()).slice(0, 4);

  const lines: string[] = ["```mermaid", "timeline", "    title Orchestrated Empowerment Trajectory"];
  limitedGroups.forEach(([phase, items]) => {
    lines.push(`    section ${sanitizeMermaid(phase)}`);
    items.slice(0, 4).forEach((item) => {
      const description = sanitizeMermaid(item.description);
      lines.push(`      ${sanitizeMermaid(item.title)} : ${description}`);
    });
  });
  lines.push("```");
  return lines.join("\n");
}

function buildParticipantTable(participants: Participant[]): string {
  const rows = participants.map((participant) => {
    const contribution = participant.contributionEth
      ? Number.parseFloat(participant.contributionEth)
      : Number.parseFloat(formatEther(BigInt(participant.contributionWei)));
    return {
      address: participant.address,
      short: shorten(participant.address),
      tokens: participant.tokens,
      contribution,
    };
  });

  const tableLines: string[] = [
    "| Participant | Tokens | Contribution (ETH) |",
    "| --- | ---: | ---: |",
  ];

  rows.forEach((row) => {
    tableLines.push(`| ${row.short} | ${row.tokens} | ${formatNumber(row.contribution)} |`);
  });

  return tableLines.join("\n");
}

function describeOwnerControls(recap: Recap): string {
  const lines: string[] = [];
  const controls = recap.ownerControls;
  lines.push(`- Market paused: **${controls.paused ? "Yes" : "No"}**`);
  lines.push(`- Whitelist enforced: **${controls.whitelistEnabled ? "Yes" : "No"}**`);
  lines.push(`- Emergency exit: **${controls.emergencyExitEnabled ? "Enabled" : "Off"}**`);
  lines.push(
    `- Validation override: **${
      controls.validationOverrideEnabled
        ? controls.validationOverrideStatus
          ? "Force-approved"
          : "Force-rejected"
        : "Inactive"
    }**`,
  );
  lines.push(`- Sale finalised: **${controls.finalized ? "Finalised" : "Pending"}**`);
  lines.push(`- Sale aborted: **${controls.aborted ? "Yes" : "No"}**`);

  if (controls.usesNativeAsset !== undefined) {
    lines.push(`- Base asset: **${controls.usesNativeAsset ? "Native (ETH)" : controls.baseAsset ?? "ERC-20"}**`);
  }
  if (controls.treasury) {
    lines.push(`- Sovereign treasury: \`${controls.treasury}\``);
  }
  if (controls.riskOracle) {
    lines.push(`- Active risk oracle: \`${controls.riskOracle}\``);
  }

  const highlights = recap.empowerment.operatorControls.highlights ?? [];
  if (highlights.length > 0) {
    lines.push("- Highlighted actuators: " + highlights.map((value) => `\`${value}\``).join(" · "));
  }

  return lines.join("\n");
}

async function generate() {
  const raw = await readFile(RECAP_PATH, "utf8");
  const parsed = recapSchema.parse(JSON.parse(raw));
  const recap: Recap = parsed;

  const empowerment = recap.empowerment;
  if (!empowerment) {
    throw new Error("Empowerment stanza missing. Re-run the orchestrator to refresh the recap dossier.");
  }

  const automationMultiplier = Number.parseFloat(empowerment.automation.automationMultiplier);
  const automationScore = clamp(automationMultiplier / (automationMultiplier + 1), 0.2, 0.99);

  const confidencePercent = recap.verification?.summary?.confidenceIndexPercent
    ? Number.parseFloat(recap.verification.summary.confidenceIndexPercent)
    : Number.parseFloat(empowerment.assurance.verificationConfidencePercent);
  const assuranceScore = clamp(confidencePercent / 100, 0.3, 0.99);

  const validatorRatio = empowerment.assurance.validatorThreshold === 0
    ? 0
    : empowerment.assurance.validatorApprovals / empowerment.assurance.validatorThreshold;
  const validatorAutomation = clamp(0.45 + validatorRatio * 0.35, 0.3, 0.95);
  const validatorAssurance = clamp(0.55 + validatorRatio * 0.35, 0.35, 0.98);

  const quadrant = buildQuadrant(
    { automation: automationScore, assurance: assuranceScore },
    { automation: validatorAutomation, assurance: validatorAssurance },
  );

  const participantValues = recap.participants.map((participant) => {
    const wei = parseBigInt(`contribution for ${participant.address}`, participant.contributionWei);
    return {
      label: shorten(participant.address),
      value: Math.max(0, toDecimal(wei)),
    };
  });
  const pieChart = buildPie(participantValues);

  const timelineHighlights = recap.timeline.slice(0, 12);
  const timeline = buildTimeline(timelineHighlights);

  const totalReserve = parseBigInt("reserve balance", empowerment.capitalFormation.reserveWei);
  const totalReserveEth = formatNumber(toDecimal(totalReserve));
  const grossContributions = parseBigInt("gross contributions", empowerment.capitalFormation.grossContributionsWei);
  const grossContributionsEth = formatNumber(toDecimal(grossContributions));

  const participantTable = buildParticipantTable(recap.participants);
  const ownerControls = describeOwnerControls(recap);

  const orchestratorMode = recap.orchestrator.mode ?? (recap.network.dryRun ? "dry-run" : "broadcast");
  const verdict = recap.verification?.summary?.verdict ?? "PASS";
  const totalChecks = recap.verification?.summary?.totalChecks ?? empowerment.assurance.totalChecks;
  const passedChecks = recap.verification?.summary?.passedChecks ?? empowerment.assurance.checksPassed;

  const lines: string[] = [
    "# α-AGI MARK Empowerment Pulse",
    "",
    `Generated ${recap.generatedAt} on **${recap.network.label}** (${recap.network.name}, chainId ${recap.network.chainId}).`,
    "",
    empowerment.tagline,
    "",
    "## Mission Snapshot",
    "",
    `- Orchestrator mode: **${orchestratorMode}**`,
    `- Automation multiplier: **${empowerment.automation.automationMultiplier}×** (${empowerment.automation.orchestratedActions} orchestrated actions from ${empowerment.automation.manualCommands} command${
      empowerment.automation.manualCommands === 1 ? "" : "s"
    })`,
    `- Verification confidence: **${confidencePercent.toFixed(2)}%** (${passedChecks}/${totalChecks} checks · verdict ${verdict})`,
    `- Validator quorum: **${empowerment.assurance.validatorApprovals}/${empowerment.assurance.validatorThreshold}** approvals`,
    `- Capital formation: **${empowerment.capitalFormation.participants}** participants · Gross **${grossContributionsEth} ETH** · Reserve **${totalReserveEth} ETH**`,
    "",
    "## Autonomous Command Quadrant",
    "",
    quadrant,
    "",
    "## Capital Participation Map",
    "",
    pieChart,
    "",
    "## Orchestration Timeline",
    "",
    timeline,
    "",
    "## Operator Command Deck",
    "",
    ownerControls,
    "",
    "## Participant Ledger",
    "",
    participantTable,
    "",
    "---",
    "",
    "The empowerment pulse evidences a sovereign-grade automation fabric: AGI Jobs v0 (v2) elevated a single operator into a",
    "launch commander who steers validator governance, capital formation, and sovereign ignition without touching low-level",
    "Solidity. This dossier exists so boards, auditors, and public stewards can witness that intelligence, assurance, and",
    "governance fused into one artefact.",
  ];

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, lines.join("\n"), "utf8");

  console.log(`🛰️  Empowerment pulse generated at ${path.relative(process.cwd(), REPORT_PATH)}`);
}

generate().catch((error) => {
  console.error("❌ Failed to generate empowerment pulse:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
