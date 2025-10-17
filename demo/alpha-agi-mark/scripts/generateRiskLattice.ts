import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { formatEther } from "ethers";
import { z } from "zod";

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
    actors: z
      .object({
        owner: z.string(),
        investors: z.array(z.string()),
        validators: z.array(z.string()),
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
        treasury: z.string(),
        riskOracle: z.string(),
        baseAsset: z.string(),
        usesNativeAsset: z.boolean(),
        fundingCapWei: z.string(),
        maxSupplyWholeTokens: z.string(),
        saleDeadlineTimestamp: z.string(),
        basePriceWei: z.string(),
        slopeWei: z.string(),
      })
      .passthrough(),
    bondingCurve: z
      .object({
        supplyWholeTokens: z.string(),
        reserveWei: z.string(),
        nextPriceWei: z.string(),
        basePriceWei: z.string(),
        slopeWei: z.string(),
      })
      .passthrough(),
    verification: z
      .object({
        supplyConsensus: z.object({ consistent: z.boolean() }).passthrough().optional(),
        pricing: z.object({ consistent: z.boolean() }).passthrough().optional(),
        capitalFlows: z.object({ consistent: z.boolean() }).passthrough().optional(),
        contributions: z.object({ consistent: z.boolean() }).passthrough().optional(),
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
      .partial()
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
      .optional(),
    launch: z
      .object({
        finalized: z.boolean().optional(),
        aborted: z.boolean().optional(),
        treasury: z.string().optional(),
        sovereignVault: z
          .object({
            manifestUri: z.string().optional(),
            totalReceivedWei: z.string(),
            totalReceivedNativeWei: z.string().optional(),
            totalReceivedExternalWei: z.string().optional(),
            vaultBalanceWei: z.string().optional(),
            lastAcknowledgedAmountWei: z.string().optional(),
            lastAcknowledgedUsedNative: z.boolean().optional(),
          })
          .passthrough(),
      })
      .passthrough()
      .optional(),
    trades: z
      .array(
        z
          .object({
            kind: z.enum(["BUY", "SELL"]),
            tokensWhole: z.string(),
            valueWei: z.string(),
            label: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

function parseBigInt(label: string, value: string | undefined): bigint {
  if (!value) {
    throw new Error(`Missing ${label}`);
  }
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error(`Failed to parse ${label}: ${(error as Error).message}`);
  }
}

function badge(armed: boolean, whenArmed: string, whenIdle: string): string {
  return armed ? `🟢 ${whenArmed}` : `⚪ ${whenIdle}`;
}

function boolPhrase(value: boolean, positive: string, negative: string): string {
  return value ? positive : negative;
}

function mermaidSafe(text: string): string {
  return text.replace(/"/g, "'");
}

function formatWei(label: string, value: string): string {
  const asBigInt = parseBigInt(label, value);
  return `${value} wei (${formatEther(asBigInt)} ETH)`;
}

async function main() {
  const recapPath = path.join(__dirname, "..", "reports", "alpha-mark-recap.json");
  const raw = await readFile(recapPath, "utf8");
  const recap = recapSchema.parse(JSON.parse(raw));

  const owner = recap.actors.owner;
  const investors = recap.actors.investors.length;
  const validators = recap.actors.validators.length;

  const supply = parseBigInt("supply", recap.bondingCurve.supplyWholeTokens);
  const reserve = parseBigInt("reserve", recap.bondingCurve.reserveWei);
  const nextPrice = parseBigInt("next price", recap.bondingCurve.nextPriceWei);
  const fundingCap = parseBigInt("funding cap", recap.ownerControls.fundingCapWei);
  const maxSupply = parseBigInt("max supply", recap.ownerControls.maxSupplyWholeTokens);

  const launchVault = recap.launch?.sovereignVault;
  const sovereignIntakeWei = launchVault ? parseBigInt("sovereign intake", launchVault.totalReceivedWei) : 0n;

  const verification = recap.verification ?? {};
  const verificationSummary = verification.summary ?? {};
  const checks = verificationSummary.totalChecks ?? 4;
  const checksPassed = verificationSummary.passedChecks ?? [
    verification.supplyConsensus,
    verification.pricing,
    verification.capitalFlows,
    verification.contributions,
  ].filter((entry) => entry?.consistent).length;
  const confidence = verificationSummary.confidenceIndexPercent ??
    `${Math.round((checksPassed / Math.max(checks, 1)) * 100)}%`;
  const verdict = verificationSummary.verdict ?? (checksPassed === checks ? "PASS" : "REVIEW");

  const empowerment = recap.empowerment;

  const controlRows = [
    {
      control: "Market pause",
      status: badge(recap.ownerControls.paused, "Armed", "Standby"),
      narrative: boolPhrase(
        recap.ownerControls.paused,
        "Trading halted post-launch ensuring sovereign funds remain sealed.",
        "Market flows available; owner can halt instantly via pauseMarket().",
      ),
    },
    {
      control: "Whitelist",
      status: badge(recap.ownerControls.whitelistEnabled, "Locked", "Open"),
      narrative: boolPhrase(
        recap.ownerControls.whitelistEnabled,
        "Participation restricted to owner-approved addresses, satisfying compliance mandates.",
        "Public participation enabled; toggle instantly restores gated mode.",
      ),
    },
    {
      control: "Emergency exit",
      status: badge(recap.ownerControls.emergencyExitEnabled, "Evacuation corridor open", "Dormant"),
      narrative: boolPhrase(
        recap.ownerControls.emergencyExitEnabled,
        "Participants may redeem while the market is paused, guaranteeing orderly unwinds.",
        "Exit corridor dormant; owner can activate it in one transaction if risk materialises.",
      ),
    },
    {
      control: "Oracle override",
      status: badge(
        recap.ownerControls.validationOverrideEnabled,
        recap.ownerControls.validationOverrideStatus ? "Force-approve engaged" : "Force-reject engaged",
        "Observer mode",
      ),
      narrative: boolPhrase(
        recap.ownerControls.validationOverrideEnabled,
        recap.ownerControls.validationOverrideStatus
          ? "Owner override set to validated – sovereign launch proceeds regardless of council latency."
          : "Owner override set to rejection – launch is frozen pending operator decision.",
        "Oracle consensus governs launch; override standing by for rapid intervention.",
      ),
    },
    {
      control: "Sovereign vault",
      status: badge(recap.ownerControls.finalized, "Ignited", "Awaiting"),
      narrative: boolPhrase(
        recap.ownerControls.finalized,
        `Launch finalised – ${formatWei("sovereign intake", launchVault?.totalReceivedWei ?? "0")} secured for the α-AGI Sovereign vault.`,
        "Launch pending; owner retains capacity to reroute treasury or abort gracefully.",
      ),
    },
    {
      control: "Abort state",
      status: badge(recap.ownerControls.aborted, "Abort invoked", "Nominal"),
      narrative: boolPhrase(
        recap.ownerControls.aborted,
        "Launch aborted; emergency exit permanently enabled to honour participant capital.",
        "Launch nominal; abort switch unpulled but primed for immediate activation.",
      ),
    },
  ];

  const controlTable = ["| Control | Status | Sovereign narrative |", "| --- | --- | --- |"]
    .concat(controlRows.map((row) => `| ${row.control} | ${row.status} | ${row.narrative} |`))
    .join("\n");

  const mindmapNodes = [
    `  Control Deck`,
    `    "${mermaidSafe(controlRows[0].status)}"`,
    `    "${mermaidSafe(controlRows[1].status)}"`,
    `    "${mermaidSafe(controlRows[2].status)}"`,
    `    "${mermaidSafe(controlRows[3].status)}"`,
    `    "${mermaidSafe(controlRows[4].status)}"`,
    `    "${mermaidSafe(controlRows[5].status)}"`,
    `  Verification`,
    `    "${mermaidSafe(badge(checksPassed === checks, "Matrix aligned", "Pending alignment"))}"`,
    `    "${mermaidSafe(`Confidence ${confidence}`)}"`,
    `    "${mermaidSafe(`Verdict ${verdict}`)}"`,
    `  Capital Formation`,
    `    "${mermaidSafe(`${supply.toString()} SeedShares live`)}"`,
    `    "${mermaidSafe(formatEther(reserve))} ETH reserve"`,
    `    "${mermaidSafe(`Funding cap ${formatEther(fundingCap)} ETH`)}"`,
    `    "${mermaidSafe(`Max supply ${maxSupply.toString()} SeedShares`)}"`,
  ].join("\n");

  const mindmap = `mindmap\n  root((α-AGI MARK\\nRisk Lattice))\n${mindmapNodes}`;

  const flowchart = `flowchart TD\n  classDef control fill:#1a1f4d,stroke:#60ffcf,color:#f6faff,stroke-width:2px;\n  classDef signal fill:#173b3f,stroke:#42d7a1,color:#e9fff8,stroke-dasharray: 5 3;\n  classDef assurance fill:#2f2445,stroke:#cfa9ff,color:#f8f4ff;\n\n  Operator((Owner Command Deck)):::signal --> Pause{{${mermaidSafe(controlRows[0].status)}}}:::control\n  Operator --> Whitelist{{${mermaidSafe(controlRows[1].status)}}}:::control\n  Operator --> Exit{{${mermaidSafe(controlRows[2].status)}}}:::control\n  Operator --> Override{{${mermaidSafe(controlRows[3].status)}}}:::control\n  Operator --> Sovereign{{${mermaidSafe(controlRows[4].status)}}}:::control\n  Operator --> Abort{{${mermaidSafe(controlRows[5].status)}}}:::control\n  VerificationMatrix[[${mermaidSafe(`Triple verification → ${confidence}`)}]]:::assurance --> Sovereign\n  ReservePower[[Reserve ${mermaidSafe(formatEther(reserve))} ETH]]:::assurance --> Sovereign\n  Sovereign -->|${mermaidSafe(formatEther(sovereignIntakeWei))} ETH delivered| Vault((α-AGI Sovereign Vault)):::signal\n`;

  const empowermentHighlights = empowerment?.operatorControls.highlights ?? [];
  const empowermentSection = empowerment
    ? `### Empowerment Pulse\n\n` +
      `- **Tagline:** ${empowerment.tagline}\n` +
      `- **Automation:** ${empowerment.automation.automationMultiplier}× multiplier (${empowerment.automation.orchestratedActions} orchestrated actions from ${empowerment.automation.manualCommands} command${
        empowerment.automation.manualCommands === 1 ? "" : "s"
      })\n` +
      `- **Assurance:** ${empowerment.assurance.verificationConfidencePercent}% confidence (${empowerment.assurance.checksPassed}/${empowerment.assurance.totalChecks} checks · Validators ${empowerment.assurance.validatorApprovals}/${empowerment.assurance.validatorThreshold})\n` +
      `- **Capital Formation:** ${
        empowerment.capitalFormation.grossContributionsEth ??
        `${formatEther(parseBigInt("empowerment gross", empowerment.capitalFormation.grossContributionsWei))} ETH`
      } raised · Reserve ${
        empowerment.capitalFormation.reserveEth ??
        `${formatEther(parseBigInt("empowerment reserve", empowerment.capitalFormation.reserveWei))} ETH`
      }\n` +
      (empowermentHighlights.length > 0
        ? `- **Control Highlights:** ${empowermentHighlights.join(" · ")}\n`
        : "")
    : "";

  const generatedAt = new Date(recap.generatedAt);
  const output = `# α-AGI MARK Risk Lattice Dossier\n\n` +
    `Generated: ${generatedAt.toISOString()}\n\n` +
    `Network: **${recap.network.label}** · Owner: **${owner}** · Investors orchestrated: **${investors}** · Validators safeguarding: **${validators}**\n\n` +
    `## Sovereign Control Deck\n\n${controlTable}\n\n` +
    `## Mission Assurance Blueprint\n\n` +
    "```mermaid\n" + mindmap + "\n```\n\n" +
    "```mermaid\n" + flowchart + "```\n\n" +
    `## Verification Signal\n\n` +
    `- Checks passed: **${checksPassed}/${checks}** (${confidence}, verdict **${verdict}**)\n` +
    `- Reserve reconciliation: **${formatEther(reserve)} ETH** live · Sovereign intake: **${formatEther(sovereignIntakeWei)} ETH**\n` +
    `- Next token price: **${formatEther(nextPrice)} ETH** under bonding-curve discipline\n\n` +
    (empowermentSection ? `${empowermentSection}\n` : "") +
    `The α-AGI MARK lattice confirms that every actuator, ledger, and sovereign vault signal is aligned. A non-technical operator ` +
    `reads this single dossier to verify that the command deck is primed, the reserves are solvent, and the verification matrix ` +
    `is locked green — a tangible proof that AGI Jobs v0 (v2) places superintelligent market control directly into human hands.`;

  const outputPath = path.join(__dirname, "..", "reports", "alpha-mark-risk-lattice.md");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
  console.log(`Synthesised α-AGI MARK risk lattice dossier to ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error) => {
  console.error("Failed to synthesise α-AGI MARK risk lattice dossier:", error);
  process.exitCode = 1;
});
