import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";

import { formatEther } from "ethers";
import { z } from "zod";

import { canonicalStringify } from "./utils/canonical";

const REPORT_PATH = path.join(__dirname, "..", "reports", "alpha-mark-superintelligence.md");
const REPORT_DIR = path.dirname(REPORT_PATH);

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
        commit: z.string().optional(),
        branch: z.string().optional(),
        mode: z.enum(["dry-run", "broadcast"]),
      })
      .passthrough(),
    verification: z
      .object({
        summary: z
          .object({
            verdict: z.enum(["PASS", "REVIEW"]).default("REVIEW"),
            confidenceIndexPercent: z.string().default("0"),
            passedChecks: z.number().default(0),
            totalChecks: z.number().default(0),
          })
          .optional(),
      })
      .passthrough()
      .optional(),
    empowerment: z
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
            reserveWei: z.string(),
          })
          .passthrough(),
        operatorControls: z
          .object({
            totalControls: z.number(),
            highlights: z.array(z.string()).optional(),
          })
          .passthrough(),
      })
      .optional(),
    bondingCurve: z
      .object({
        supplyWholeTokens: z.string(),
        reserveWei: z.string(),
        nextPriceWei: z.string(),
        basePriceWei: z.string(),
        slopeWei: z.string(),
      })
      .passthrough(),
    ownerControls: z
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
        fundingCapWei: z.string(),
        maxSupplyWholeTokens: z.string(),
        saleDeadlineTimestamp: z.string(),
      })
      .passthrough(),
    validators: z
      .object({
        approvalCount: z.string(),
        approvalThreshold: z.string(),
      })
      .passthrough(),
    participants: z
      .array(
        z
          .object({
            address: z.string(),
            tokens: z.string(),
            tokensWei: z.string(),
            contributionWei: z.string(),
          })
          .passthrough(),
      )
      .nonempty(),
    trades: z
      .array(
        z
          .object({
            kind: z.enum(["BUY", "SELL"]),
            label: z.string(),
            tokensWhole: z.string(),
            valueWei: z.string(),
          })
          .passthrough(),
      )
      .nonempty(),
    timeline: z
      .array(
        z
          .object({
            phase: z.string(),
            title: z.string(),
            description: z.string(),
          })
          .passthrough(),
      )
      .nonempty(),
    launch: z
      .object({
        finalized: z.boolean(),
        aborted: z.boolean(),
        treasury: z.string().optional(),
        sovereignVault: z
          .object({
            manifestUri: z.string(),
            totalReceivedWei: z.string(),
            lastAcknowledgedAmountWei: z.string(),
            lastAcknowledgedMetadataHex: z.string(),
            decodedMetadata: z.string().optional(),
            lastAcknowledgedUsedNative: z.boolean().optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

function escapeMermaid(input: string): string {
  return input.replace(/[\r\n]/g, " ").replace(/"/g, "'");
}

function formatBool(value: boolean): string {
  return value ? "✅ Enabled" : "⛔️ Disabled";
}

function formatWei(wei: string): { raw: bigint; eth: string } {
  const raw = BigInt(wei);
  return { raw, eth: formatEther(raw) };
}

async function loadRecap() {
  const recapPath = path.join(__dirname, "..", "reports", "alpha-mark-recap.json");
  const raw = await readFile(recapPath, "utf-8");
  const parsedJson = JSON.parse(raw);
  return recapSchema.parse(parsedJson);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const recap = await loadRecap();

  assert(!!recap.empowerment, "Recap missing empowerment stanza. Run the orchestrator first.");
  const empowerment = recap.empowerment!;

  const verificationSummary = recap.verification?.summary;
  assert(!!verificationSummary, "Recap lacks verification summary; rerun verify script.");
  assert(
    verificationSummary!.verdict === "PASS",
    `Verification verdict is ${verificationSummary!.verdict}, expected PASS.`,
  );

  const supply = BigInt(recap.bondingCurve.supplyWholeTokens);
  const reserve = BigInt(recap.bondingCurve.reserveWei);
  const participantGross = recap.participants.reduce((acc, participant) => acc + BigInt(participant.contributionWei), 0n);
  const empowermentGross = BigInt(empowerment.capitalFormation.grossContributionsWei);
  assert(
    participantGross === empowermentGross,
    `Participant contribution aggregate ${participantGross} does not match empowerment gross ${empowermentGross}.`,
  );

  const reserveSnapshot = BigInt(empowerment.capitalFormation.reserveWei);
  assert(
    reserveSnapshot === reserve,
    `Empowerment reserve ${reserveSnapshot} does not match bonding curve reserve ${reserve}.`,
  );

  assert(
    empowerment.assurance.validatorApprovals === Number(recap.validators.approvalCount),
    "Validator approvals mismatch between empowerment snapshot and validator registry.",
  );

  const ownerControlRows = [
    { label: "Market paused", value: formatBool(recap.ownerControls.paused) },
    { label: "Whitelist mode", value: formatBool(recap.ownerControls.whitelistEnabled) },
    { label: "Emergency exit", value: formatBool(recap.ownerControls.emergencyExitEnabled) },
    { label: "Launch finalized", value: formatBool(recap.ownerControls.finalized) },
    { label: "Launch aborted", value: formatBool(recap.ownerControls.aborted) },
    {
      label: "Validation override",
      value: recap.ownerControls.validationOverrideEnabled
        ? recap.ownerControls.validationOverrideStatus
          ? "✅ Forcing launch-ready"
          : "⚠️ Forcing hold"
        : "⛔️ Disabled",
    },
    { label: "Treasury", value: recap.ownerControls.treasury ?? "—" },
    { label: "Risk oracle", value: recap.ownerControls.riskOracle ?? "—" },
    {
      label: "Base asset",
      value: recap.ownerControls.usesNativeAsset ? "Native ETH" : recap.ownerControls.baseAsset ?? "External ERC-20",
    },
    { label: "Funding cap (wei)", value: recap.ownerControls.fundingCapWei },
    { label: "Max supply (tokens)", value: recap.ownerControls.maxSupplyWholeTokens },
    { label: "Sale deadline", value: recap.ownerControls.saleDeadlineTimestamp },
  ];

  const bondingCurve = {
    supply,
    reserve,
    basePrice: formatWei(recap.bondingCurve.basePriceWei),
    slope: formatWei(recap.bondingCurve.slopeWei),
    nextPrice: formatWei(recap.bondingCurve.nextPriceWei),
  };

  const supplyDisplay = supply.toString();
  const reserveDisplay = formatEther(reserve);
  const contributionsDisplay = formatEther(participantGross);

  const participantRows = recap.participants.map(
    (participant) => `| ${participant.address} | ${participant.tokens} | ${formatEther(BigInt(participant.contributionWei))} |`,
  );

  const timelineSections: Record<string, string[]> = {};
  recap.timeline.slice(0, 8).forEach((entry) => {
    const safePhase = escapeMermaid(entry.phase);
    const safeTitle = escapeMermaid(entry.title);
    const safeDescription = escapeMermaid(entry.description);
    if (!timelineSections[safePhase]) {
      timelineSections[safePhase] = [];
    }
    timelineSections[safePhase].push(`${safeTitle} : ${safeDescription}`);
  });

  const timelineMermaidLines: string[] = ["```mermaid", "timeline", "    title α-AGI MARK Sovereign Orchestration"];
  Object.entries(timelineSections).forEach(([phase, events]) => {
    timelineMermaidLines.push(`    section ${phase}`);
    events.forEach((event) => {
      timelineMermaidLines.push(`      ${event}`);
    });
  });
  timelineMermaidLines.push("```");

  const flowMermaid = [
    "```mermaid",
    "flowchart LR",
    "    Operator((Operator)) -->|Command one| Orchestrator{{AGI Jobs Orchestrator}}",
    "    Orchestrator --> NovaSeed[Nova-Seed NFT]",
    "    Orchestrator --> Exchange[AlphaMark Exchange]",
    "    Orchestrator --> Oracle[Risk Oracle]",
    "    Investors((Investors)) --> Exchange",
    `    Oracle -->|Approvals ${recap.validators.approvalCount}/${recap.validators.approvalThreshold}| Exchange`,
    `    Exchange -->|Reserve ${reserveDisplay} ETH| Vault[α-AGI Sovereign Vault]`,
    "    Vault --> Sovereign[[Sovereign Ignition]]",
    "```",
  ].join("\n");

  const assuranceMermaid = [
    "```mermaid",
    "mindmap",
    "  root((α-AGI MARK Assurance))",
    `    Confidence[${verificationSummary.confidenceIndexPercent}% confidence]`,
    `      Checks[${verificationSummary.passedChecks}/${verificationSummary.totalChecks} invariants aligned]`,
    "    Validation[Validator quorum]",
    `      Approvals[${recap.validators.approvalCount}/${recap.validators.approvalThreshold} approvals]`,
    "    Controls[Owner actuators]",
    `      Matrix[${empowerment.operatorControls.totalControls} controls catalogued]`,
    "    Capital[Reserve discipline]",
    `      Supply[${supplyDisplay} SeedShares outstanding]`,
    `      ReserveBalance[${reserveDisplay} ETH reserve]`,
    "```",
  ].join("\n");

  const pieMermaid = [
    "```mermaid",
    "pie showData",
    "    title Empowerment Composition",
    `    \"Automation\" : ${empowerment.automation.orchestratedActions}`,
    `    \"Verification\" : ${empowerment.assurance.checksPassed}`,
    `    \"Capital\" : ${empowerment.capitalFormation.participants}`,
    `    \"Controls\" : ${empowerment.operatorControls.totalControls}`,
    "```",
  ].join("\n");

  const markdownLines: string[] = [
    "# α-AGI MARK Superintelligence Brief",
    "",
    `> [!SUCCESS]`,
    `> AGI Jobs orchestrated **${empowerment.automation.orchestratedActions} mission-grade actions** from ${empowerment.automation.manualCommands} command${empowerment.automation.manualCommands === 1 ? "" : "s"}, sustaining ${verificationSummary.confidenceIndexPercent}% verification confidence and dispatching ${reserveDisplay} ETH to the sovereign vault.`,
    "",
    "## Mission Signals",
    "",
    `- **Network:** ${recap.network.label} (${recap.network.name})`,
    `- **Orchestrator commit:** ${recap.orchestrator.commit ?? "unknown"}`,
    `- **Verification verdict:** ${verificationSummary.verdict}`,
    `- **Confidence index:** ${verificationSummary.confidenceIndexPercent}% (${verificationSummary.passedChecks}/${verificationSummary.totalChecks})`,
    `- **Capital raised:** ${contributionsDisplay} ETH across ${recap.participants.length} contributors`,
    `- **Supply outstanding:** ${supplyDisplay} SeedShares`,
  ];
  markdownLines.push("", "## Sovereign Control Deck", "", "| Control | Status |", "| --- | --- |");
  markdownLines.push(...ownerControlRows.map((row) => `| ${row.label} | ${row.value} |`));
  markdownLines.push("", "## Participant Ledger Snapshot", "", "| Participant | SeedShares | Contribution (ETH) |", "| --- | --- | --- |");
  markdownLines.push(...participantRows);
  markdownLines.push("", "## Orchestration Timeline", "");
  markdownLines.push(...timelineMermaidLines);
  markdownLines.push("", "## Capital Flow Blueprint", "", flowMermaid);
  markdownLines.push("", "## Assurance Mindmap", "", assuranceMermaid);
  markdownLines.push("", "## Empowerment Composition", "", pieMermaid);
  markdownLines.push("", "## Bonding Curve Telemetry", "");
  markdownLines.push(
    `- **Reserve:** ${reserveDisplay} ETH`,
    `- **Next price:** ${bondingCurve.nextPrice.eth} ETH (${bondingCurve.nextPrice.raw.toString()} wei)`,
    `- **Base price:** ${bondingCurve.basePrice.eth} ETH (${bondingCurve.basePrice.raw.toString()} wei)`,
    `- **Slope:** ${bondingCurve.slope.eth} ETH/token`,
  );
  markdownLines.push("", "## Sovereign Vault", "");
  markdownLines.push(
    `- **Recipient treasury:** ${recap.launch.treasury ?? "not configured"}`,
    `- **Vault manifest:** ${recap.launch.sovereignVault.manifestUri}`,
    `- **Last ignition metadata:** ${recap.launch.sovereignVault.decodedMetadata ?? recap.launch.sovereignVault.lastAcknowledgedMetadataHex}`,
    `- **Native launch:** ${recap.launch.sovereignVault.lastAcknowledgedUsedNative ? "Yes" : "No"}`,
    `- **Total received:** ${formatEther(BigInt(recap.launch.sovereignVault.totalReceivedWei))} ETH`,
  );
  markdownLines.push("", "---", "", "Report checksum (sha256 over canonical JSON snapshot):", "", "```");
  markdownLines.push(canonicalStringify({
    generatedAt: recap.generatedAt,
    network: recap.network,
    verification: verificationSummary,
    empowerment,
    bondingCurve: recap.bondingCurve,
    validators: recap.validators,
  }));
  markdownLines.push("```");
  const markdown = markdownLines.join("\n");

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, markdown);
  console.log(`🧠 Superintelligence brief written to ${path.relative(path.join(__dirname, "..", "..", ".."), REPORT_PATH)}`);
}

main().catch((error) => {
  console.error("❌ Failed to generate superintelligence brief:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
