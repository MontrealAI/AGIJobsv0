#!/usr/bin/env ts-node
/*
 * Phase 8 — Universal Value Dominance orchestration console.
 * Loads the manifest, synthesises calldata for governance, and emits a
 * ready-to-copy runbook for non-technical operators.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Interface, keccak256, toUtf8Bytes } from "ethers";

const CONFIG_PATH = join(__dirname, "..", "config", "universal.value.manifest.json");
const OUTPUT_DIR = join(__dirname, "..", "output");
const ENV_CHAIN_ID = Number(process.env.PHASE8_CHAIN_ID ?? "1");
const DEFAULT_CHAIN_ID = Number.isFinite(ENV_CHAIN_ID) && ENV_CHAIN_ID > 0 ? ENV_CHAIN_ID : 1;
const ENV_MANAGER = process.env.PHASE8_MANAGER_ADDRESS ?? "";
const MANAGER_ADDRESS = /^0x[a-fA-F0-9]{40}$/.test(ENV_MANAGER)
  ? ENV_MANAGER.toLowerCase()
  : "0x0000000000000000000000000000000000000000";
const SKIP_SINGLE_CALL_KEYS = new Set([
  "registerDomain",
  "registerSentinel",
  "registerCapitalStream",
  "removeDomain",
  "removeSentinel",
  "removeCapitalStream",
  "setSentinelDomains",
  "setCapitalStreamDomains",
]);
const LABEL_MAP: Record<string, string> = {
  registerDomains: "registerDomain",
  registerSentinels: "registerSentinel",
  registerCapitalStreams: "registerCapitalStream",
  sentinelDomainCalls: "setSentinelDomains",
  streamDomainCalls: "setCapitalStreamDomains",
  removeDomains: "removeDomain",
  removeSentinels: "removeSentinel",
  removeCapitalStreams: "removeCapitalStream",
};

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

function banner(title: string) {
  const pad = "=".repeat(title.length + 8);
  console.log();
  console.log(`\x1b[38;5;213m${pad}\x1b[0m`);
  console.log(`\x1b[38;5;51m>>> ${title} <<<\x1b[0m`);
  console.log(`\x1b[38;5;213m${pad}\x1b[0m`);
}

function shortAddress(label: string, address?: string) {
  if (!address) return `${label}: —`;
  return `${label}: ${address.slice(0, 8)}…${address.slice(-6)}`;
}

function computeMetrics(config: any) {
  const domains = config.domains ?? [];
  const sentinels = config.sentinels ?? [];
  const streams = config.capitalStreams ?? [];
  const plan = config.selfImprovement?.plan ?? {};
  const totalMonthlyUSD = domains.reduce((acc: number, d: any) => acc + Number(d.valueFlowMonthlyUSD ?? 0), 0);
  const maxAutonomy = domains.reduce((acc: number, d: any) => Math.max(acc, Number(d.autonomyLevelBps ?? 0)), 0);
  const averageResilience =
    domains.length === 0
      ? 0
      : domains.reduce((acc: number, d: any) => acc + Number(d.resilienceIndex ?? 0), 0) / domains.length;
  const guardianCoverageMinutes = sentinels.reduce((acc: number, s: any) => acc + Number(s.coverageSeconds ?? 0), 0) / 60;
  const annualBudget = streams.reduce((acc: number, s: any) => acc + Number(s.annualBudget ?? 0), 0);
  const coverageSet = new Set<string>();
  for (const sentinel of sentinels) {
    for (const domain of sentinel.domains ?? []) {
      coverageSet.add(String(domain).toLowerCase());
    }
  }
  const coverageRatio = domains.length === 0 ? 0 : (coverageSet.size / domains.length) * 100;
  const cadenceHours = Number(plan.cadenceSeconds ?? 0) / 3600;
  const lastExecutedAt = Number(plan.lastExecutedAt ?? 0);
  return {
    totalMonthlyUSD,
    maxAutonomy,
    averageResilience,
    guardianCoverageMinutes,
    annualBudget,
    coverageRatio,
    cadenceHours,
    lastExecutedAt,
  };
}

function usd(value: number) {
  if (value === 0) return "$0";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatAmount(value: any) {
  try {
    const big = BigInt(value ?? 0);
    if (big === BigInt(0)) return "0";
    const str = big.toString();
    if (str.length <= 6) return str;
    const prefix = str.slice(0, 3);
    return `${prefix}… (10^${str.length - 3})`;
  } catch (error) {
    return String(value ?? "0");
  }
}

function slugId(slug: string): string {
  return keccak256(toUtf8Bytes(slug.toLowerCase()));
}

function mermaid(config: any) {
  const lines = ["graph TD", "  Governance[[Guardian DAO]] --> Manager(Phase8UniversalValueManager)"];
  for (const domain of config.domains ?? []) {
    const slug = String(domain.slug || "domain").replace(/[^a-z0-9]/gi, "");
    lines.push(`  Manager --> ${slug}([${domain.name ?? slug}])`);
  }
  lines.push("  Manager --> Treasury[[Universal Treasury]]");
  lines.push("  Manager --> Sentinels{Sentinel lattice}");
  lines.push("  Sentinels --> Pause[System pause]");
  lines.push("  Manager --> Streams[[Capital Streams]]");
  for (const stream of config.capitalStreams ?? []) {
    const slug = String(stream.slug || "stream").replace(/[^a-z0-9]/gi, "");
    lines.push(`  Streams --> ${slug}Stream([${stream.name ?? slug}])`);
  }
  lines.push("  Streams --> Domains([Autonomous domains])");
  return lines.join("\n");
}

function calldata(config: any) {
  const iface = new Interface([
    "function setGlobalParameters((address,address,address,address,address,address,uint64,uint64,uint256,string) params)",
    "function setGuardianCouncil(address council)",
    "function setSystemPause(address newPause)",
    "function registerDomain((string slug,string name,string metadataURI,address orchestrator,address capitalVault,address validatorModule,address policyKernel,uint64 heartbeatSeconds,uint256 tvlLimit,uint256 autonomyLevelBps,bool active) config)",
    "function registerSentinel((string slug,string name,string uri,address agent,uint64 coverageSeconds,uint256 sensitivityBps,bool active) profile)",
    "function registerCapitalStream((string slug,string name,string uri,address vault,uint256 annualBudget,uint256 expansionBps,bool active) stream)",
    "function setSentinelDomains(bytes32 id, bytes32[] domainIds)",
    "function setCapitalStreamDomains(bytes32 id, bytes32[] domainIds)",
    "function setSelfImprovementPlan((string planURI,bytes32 planHash,uint64 cadenceSeconds,uint64 lastExecutedAt,string lastReportURI) plan)",
    "function recordSelfImprovementExecution(uint64 executedAt,string reportURI)",
    "function removeDomain(bytes32 id)",
    "function removeSentinel(bytes32 id)",
    "function removeCapitalStream(bytes32 id)"
  ]);

  const global = config.global ?? {};
  const domainTuples = (config.domains ?? []).map((domain: any) => [
    domain.slug,
    domain.name,
    domain.metadataURI,
    domain.orchestrator,
    domain.capitalVault,
    domain.validatorModule,
    domain.policyKernel,
    BigInt(domain.heartbeatSeconds ?? 0),
    BigInt(domain.tvlLimit ?? 0),
    BigInt(domain.autonomyLevelBps ?? 0),
    Boolean(domain.active),
  ]);
  const sentinelTuples = (config.sentinels ?? []).map((sentinel: any) => [
    sentinel.slug,
    sentinel.name,
    sentinel.uri,
    sentinel.agent,
    BigInt(sentinel.coverageSeconds ?? 0),
    BigInt(sentinel.sensitivityBps ?? 0),
    Boolean(sentinel.active),
  ]);
  const streamTuples = (config.capitalStreams ?? []).map((stream: any) => [
    stream.slug,
    stream.name,
    stream.uri,
    stream.vault,
    BigInt(stream.annualBudget ?? 0),
    BigInt(stream.expansionBps ?? 0),
    Boolean(stream.active),
  ]);
  const plan = config.selfImprovement?.plan ?? {};
  const sentinelDomains = (config.sentinels ?? []).map((entry: any) => ({
    slug: entry.slug,
    id: slugId(String(entry.slug || "")),
    domains: (entry.domains ?? []).map((domain: string) => slugId(String(domain || ""))),
  }));
  const streamDomains = (config.capitalStreams ?? []).map((entry: any) => ({
    slug: entry.slug,
    id: slugId(String(entry.slug || "")),
    domains: (entry.domains ?? []).map((domain: string) => slugId(String(domain || ""))),
  }));

  const tuples = {
    global: [
      global.treasury,
      global.universalVault,
      global.upgradeCoordinator,
      global.validatorRegistry,
      global.missionControl,
      global.knowledgeGraph,
      BigInt(global.heartbeatSeconds ?? 0),
      BigInt(global.guardianReviewWindow ?? 0),
      BigInt(global.maxDrawdownBps ?? 0),
      String(global.manifestoURI ?? ""),
    ],
    guardian: global.guardianCouncil,
    pause: global.systemPause,
    plan: [
      String(plan.planURI ?? ""),
      String(plan.planHash ?? "0x0000000000000000000000000000000000000000000000000000000000000000"),
      BigInt(plan.cadenceSeconds ?? 0),
      BigInt(plan.lastExecutedAt ?? 0),
      String(plan.lastReportURI ?? ""),
    ],
  };

  const nextExecution =
    plan && plan.cadenceSeconds
      ? BigInt(plan.lastExecutedAt ?? 0) + BigInt(plan.cadenceSeconds ?? 0)
      : undefined;
  const registerDomainCalls = domainTuples.map((tuple: any, index: number) => ({
    slug: config.domains[index]?.slug,
    data: iface.encodeFunctionData("registerDomain", [tuple]),
  }));
  const registerSentinelCalls = sentinelTuples.map((tuple: any, index: number) => ({
    slug: config.sentinels[index]?.slug,
    data: iface.encodeFunctionData("registerSentinel", [tuple]),
  }));
  const registerStreamCalls = streamTuples.map((tuple: any, index: number) => ({
    slug: config.capitalStreams[index]?.slug,
    data: iface.encodeFunctionData("registerCapitalStream", [tuple]),
  }));

  const removeDomainCalls = (config.domains ?? []).map((domain: any) => ({
    slug: domain.slug,
    data: iface.encodeFunctionData("removeDomain", [slugId(String(domain.slug || ""))]),
  }));
  const removeSentinelCalls = (config.sentinels ?? []).map((sentinel: any) => ({
    slug: sentinel.slug,
    data: iface.encodeFunctionData("removeSentinel", [slugId(String(sentinel.slug || ""))]),
  }));
  const removeStreamCalls = (config.capitalStreams ?? []).map((stream: any) => ({
    slug: stream.slug,
    data: iface.encodeFunctionData("removeCapitalStream", [slugId(String(stream.slug || ""))]),
  }));

  return {
    setGlobalParameters: iface.encodeFunctionData("setGlobalParameters", [tuples.global]),
    setGuardianCouncil: iface.encodeFunctionData("setGuardianCouncil", [tuples.guardian ?? "0x0000000000000000000000000000000000000000"]),
    setSystemPause: iface.encodeFunctionData("setSystemPause", [tuples.pause ?? "0x0000000000000000000000000000000000000000"]),
    registerDomain: registerDomainCalls[0]?.data,
    registerSentinel: registerSentinelCalls[0]?.data,
    registerCapitalStream: registerStreamCalls[0]?.data,
    registerDomains: registerDomainCalls,
    registerSentinels: registerSentinelCalls,
    registerCapitalStreams: registerStreamCalls,
    setSentinelDomains:
      sentinelDomains.length > 0
        ? iface.encodeFunctionData("setSentinelDomains", [sentinelDomains[0].id, sentinelDomains[0].domains])
        : undefined,
    setCapitalStreamDomains:
      streamDomains.length > 0
        ? iface.encodeFunctionData("setCapitalStreamDomains", [streamDomains[0].id, streamDomains[0].domains])
        : undefined,
    setSelfImprovementPlan: iface.encodeFunctionData("setSelfImprovementPlan", [tuples.plan]),
    recordSelfImprovementExecution:
      nextExecution && plan.lastReportURI
        ? iface.encodeFunctionData("recordSelfImprovementExecution", [nextExecution, plan.lastReportURI])
        : undefined,
    removeDomain: removeDomainCalls[0]?.data,
    removeSentinel: removeSentinelCalls[0]?.data,
    removeCapitalStream: removeStreamCalls[0]?.data,
    removeDomains: removeDomainCalls,
    removeSentinels: removeSentinelCalls,
    removeCapitalStreams: removeStreamCalls,
    sentinelDomainCalls: sentinelDomains.map((entry: any) => ({
      slug: entry.slug,
      data: iface.encodeFunctionData("setSentinelDomains", [entry.id, entry.domains]),
    })),
    streamDomainCalls: streamDomains.map((entry: any) => ({
      slug: entry.slug,
      data: iface.encodeFunctionData("setCapitalStreamDomains", [entry.id, entry.domains]),
    })),
  };
}

type CalldataEntry = { label: string; slug?: string; data: string };

function flattenCalldataEntries(data: Record<string, any>): CalldataEntry[] {
  const entries: CalldataEntry[] = [];
  for (const [label, payload] of Object.entries(data)) {
    if (!payload || SKIP_SINGLE_CALL_KEYS.has(label)) continue;
    if (Array.isArray(payload)) {
      for (const item of payload) {
        if (!item || typeof item !== "object" || !item.data) continue;
        entries.push({ label: LABEL_MAP[label] ?? label, slug: item.slug, data: item.data });
      }
      continue;
    }
    if (typeof payload === "object" && (payload as any).data) {
      entries.push({ label, data: (payload as any).data, slug: (payload as any).slug });
      continue;
    }
    if (typeof payload === "string") {
      entries.push({ label, data: payload });
    }
  }
  return entries;
}

function ensureOutputDirectory() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function telemetryMarkdown(config: any, metrics: ReturnType<typeof computeMetrics>): string {
  const sentinelCoverageMap = new Map<string, string[]>();
  for (const sentinel of config.sentinels ?? []) {
    for (const domain of sentinel.domains ?? []) {
      const key = String(domain).toLowerCase();
      const list = sentinelCoverageMap.get(key) ?? [];
      list.push(sentinel.name ?? sentinel.slug ?? "sentinel");
      sentinelCoverageMap.set(key, list);
    }
  }

  const streamDomainMap = new Map<string, string[]>();
  for (const stream of config.capitalStreams ?? []) {
    for (const domain of stream.domains ?? []) {
      const key = String(domain).toLowerCase();
      const list = streamDomainMap.get(key) ?? [];
      list.push(stream.name ?? stream.slug ?? "stream");
      streamDomainMap.set(key, list);
    }
  }

  const lines: string[] = [];
  lines.push(`# Phase 8 — Universal Value Dominance Telemetry`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`## Global Metrics`);
  lines.push(`- Total monthly value flow: ${usd(metrics.totalMonthlyUSD)}`);
  lines.push(`- Annual capital allocation: ${usd(metrics.annualBudget)}`);
  lines.push(`- Average resilience index: ${metrics.averageResilience.toFixed(3)}`);
  lines.push(`- Sentinel coverage per guardian cycle: ${metrics.guardianCoverageMinutes.toFixed(1)} minutes`);
  lines.push(`- Domains covered by sentinels: ${metrics.coverageRatio.toFixed(1)}%`);
  lines.push(`- Maximum encoded autonomy: ${metrics.maxAutonomy} bps`);
  if (metrics.cadenceHours) {
    lines.push(`- Self-improvement cadence: every ${metrics.cadenceHours.toFixed(2)} hours`);
  }
  if (metrics.lastExecutedAt) {
    lines.push(`- Last self-improvement execution: ${new Date(metrics.lastExecutedAt * 1000).toISOString()}`);
  }
  lines.push("");

  lines.push(`## Governance Control Surface`);
  lines.push(`- Treasury: ${config.global?.treasury}`);
  lines.push(`- Universal vault: ${config.global?.universalVault}`);
  lines.push(`- Upgrade coordinator: ${config.global?.upgradeCoordinator}`);
  lines.push(`- Validator registry: ${config.global?.validatorRegistry}`);
  lines.push(`- Mission control: ${config.global?.missionControl}`);
  lines.push(`- Knowledge graph: ${config.global?.knowledgeGraph}`);
  lines.push(`- Guardian council: ${config.global?.guardianCouncil}`);
  lines.push(`- System pause: ${config.global?.systemPause}`);
  lines.push(`- Manifest URI: ${config.global?.manifestoURI}`);
  lines.push(`- Max drawdown guard: ${config.global?.maxDrawdownBps} bps`);
  lines.push("");

  lines.push(`## Domains`);
  lines.push(`| Domain | Autonomy (bps) | Resilience | Heartbeat (s) | TVL cap | Monthly value | Sentinels | Capital streams |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const domain of config.domains ?? []) {
    const slug = String(domain.slug ?? "").toLowerCase();
    const sentinelList = (sentinelCoverageMap.get(slug) ?? ["—"]).join(", ");
    const streamList = (streamDomainMap.get(slug) ?? ["—"]).join(", ");
    lines.push(
      `| ${domain.name} | ${domain.autonomyLevelBps} | ${(domain.resilienceIndex ?? 0).toFixed(3)} | ${domain.heartbeatSeconds} | ${formatAmount(domain.tvlLimit)} | ${usd(Number(domain.valueFlowMonthlyUSD ?? 0))} | ${sentinelList} | ${streamList} |`,
    );
  }
  lines.push("");

  lines.push(`## Sentinel Lattice`);
  for (const sentinel of config.sentinels ?? []) {
    lines.push(
      `- ${sentinel.name} · coverage ${sentinel.coverageSeconds}s · sensitivity ${sentinel.sensitivityBps} bps · guarding ${(sentinel.domains || []).join(", ")}`,
    );
  }
  lines.push("");

  lines.push(`## Capital Streams`);
  for (const stream of config.capitalStreams ?? []) {
    lines.push(
      `- ${stream.name} · ${usd(Number(stream.annualBudget ?? 0))}/yr · expansion ${stream.expansionBps} bps · targets ${(stream.domains || []).join(", ")}`,
    );
  }
  lines.push("");

  lines.push(`## Self-Improvement Kernel`);
  const plan = config.selfImprovement?.plan;
  if (plan) {
    lines.push(
      `- Strategic plan: cadence ${plan.cadenceSeconds}s (${(Number(plan.cadenceSeconds ?? 0) / 3600).toFixed(2)} h) · hash ${plan.planHash} · last report ${plan.lastReportURI}`,
    );
  }
  for (const playbook of config.selfImprovement?.playbooks ?? []) {
    lines.push(`- Playbook ${playbook.name} (${playbook.automation}) · owner ${playbook.owner} · guardrails ${playbook.guardrails.join(", ")}`);
  }
  if (config.selfImprovement?.autonomyGuards) {
    const guard = config.selfImprovement.autonomyGuards;
    lines.push(
      `- Autonomy guard: ≤${guard.maxAutonomyBps} bps · override window ${guard.humanOverrideMinutes} minutes · escalation ${(guard.escalationChannels || []).join(" → ")}`,
    );
  }

  return lines.join("\n");
}

function buildSafeTransactions(entries: CalldataEntry[], managerAddress: string) {
  return entries.map((entry) => ({
    to: managerAddress,
    value: "0",
    data: entry.data,
    contractMethod: {
      name: entry.slug ? `${entry.label}(${entry.slug})` : entry.label,
      payable: false,
      inputs: [],
    },
    contractInputsValues: {},
  }));
}

function writeArtifacts(config: any, metrics: ReturnType<typeof computeMetrics>, data: Record<string, any>) {
  ensureOutputDirectory();
  const generatedAt = new Date().toISOString();
  const entries = flattenCalldataEntries(data);
  const callManifest = {
    generatedAt,
    managerAddress: MANAGER_ADDRESS,
    chainId: DEFAULT_CHAIN_ID,
    metrics: {
      totalMonthlyUSD: metrics.totalMonthlyUSD,
      annualBudgetUSD: metrics.annualBudget,
      averageResilience: metrics.averageResilience,
      guardianCoverageMinutes: metrics.guardianCoverageMinutes,
    },
    calls: entries,
  };
  const callManifestPath = join(OUTPUT_DIR, "phase8-governance-calldata.json");
  writeFileSync(callManifestPath, JSON.stringify(callManifest, null, 2));

  const safeBatch = {
    version: "1.0",
    chainId: String(DEFAULT_CHAIN_ID),
    createdAt: Date.now(),
    meta: {
      name: "Phase 8 — Universal Value Dominance",
      description: `Generated by AGI Jobs v0 (v2) on ${generatedAt}`,
      txBuilderVersion: "1.16.1",
      createdFromSafeAddress: MANAGER_ADDRESS,
      createdFromOwnerAddress: "",
      checksum: "",
    },
    transactions: buildSafeTransactions(entries, MANAGER_ADDRESS),
  };
  const safePath = join(OUTPUT_DIR, "phase8-safe-transaction-batch.json");
  writeFileSync(safePath, JSON.stringify(safeBatch, null, 2));

  const mermaidPath = join(OUTPUT_DIR, "phase8-mermaid-diagram.mmd");
  writeFileSync(mermaidPath, mermaid(config));

  const reportPath = join(OUTPUT_DIR, "phase8-telemetry-report.md");
  writeFileSync(reportPath, telemetryMarkdown(config, metrics));

  return [
    { label: "Calldata manifest", path: callManifestPath },
    { label: "Safe transaction batch", path: safePath },
    { label: "Mermaid diagram", path: mermaidPath },
    { label: "Telemetry report", path: reportPath },
  ];
}

function printDomainTable(config: any) {
  const rows = config.domains?.map((domain: any) => {
    const slug = String(domain.slug ?? "");
    const id = keccak256(toUtf8Bytes(slug.toLowerCase())).slice(0, 10);
    return [
      domain.name ?? slug,
      `ID ${id}`,
      `TVL ≤ ${formatAmount(domain.tvlLimit)}`,
      `Autonomy ${domain.autonomyLevelBps ?? 0} bps`,
      `Resilience ${(domain.resilienceIndex ?? 0).toFixed(3)}`,
      domain.autonomyNarrative ?? "",
    ];
  });
  if (!rows || rows.length === 0) return;
  const widths = rows[0].map((_: string, idx: number) => Math.max(...rows.map((r: string[]) => r[idx].length)));
  console.log("  \x1b[35mDominion registry\x1b[0m");
  for (const row of rows) {
    const formatted = row
      .map((cell: string, idx: number) => cell.padEnd(widths[idx] + (idx === row.length - 1 ? 0 : 2)))
      .join("");
    console.log(`  ${formatted}`);
  }
}

(function main() {
  const config = loadConfig();
  banner("Phase 8 — Universal Value Dominance");
  console.log("Configuration:", CONFIG_PATH);

  const metrics = computeMetrics(config);
  banner("Network telemetry");
  console.log(`Total monthly on-chain value: ${usd(metrics.totalMonthlyUSD)}`);
  console.log(`Annual capital allocation: ${usd(metrics.annualBudget)}`);
  console.log(`Average resilience index: ${metrics.averageResilience.toFixed(3)}`);
  console.log(`Guardian sentinel coverage: ${metrics.guardianCoverageMinutes.toFixed(1)} minutes per cycle`);
  console.log(`Domains with sentinel coverage: ${metrics.coverageRatio.toFixed(1)}%`);
  console.log(`Maximum encoded autonomy: ${metrics.maxAutonomy} bps`);
  if (metrics.cadenceHours) {
    console.log(`Self-improvement cadence: every ${metrics.cadenceHours.toFixed(2)} hours`);
  }
  if (metrics.lastExecutedAt) {
    console.log(`Last self-improvement execution: ${new Date(metrics.lastExecutedAt * 1000).toISOString()}`);
  }

  banner("Governance control surface");
  console.log(shortAddress("Treasury", config.global?.treasury));
  console.log(shortAddress("Universal vault", config.global?.universalVault));
  console.log(shortAddress("Upgrade coordinator", config.global?.upgradeCoordinator));
  console.log(shortAddress("Validator registry", config.global?.validatorRegistry));
  console.log(shortAddress("Mission control", config.global?.missionControl));
  console.log(shortAddress("Knowledge graph", config.global?.knowledgeGraph));
  console.log(shortAddress("Guardian council", config.global?.guardianCouncil));
  console.log(shortAddress("System pause", config.global?.systemPause));
  console.log(`Manifest URI: ${config.global?.manifestoURI}`);

  banner("Domain registry summary");
  printDomainTable(config);

  banner("Sentinel lattice");
  for (const sentinel of config.sentinels ?? []) {
    console.log(
      `  ${sentinel.name}: coverage ${sentinel.coverageSeconds}s, sensitivity ${sentinel.sensitivityBps}bps → ${(
        sentinel.domains || []
      ).join(", ")}`,
    );
  }

  banner("Capital stream governance");
  for (const stream of config.capitalStreams ?? []) {
    console.log(
      `  ${stream.name}: ${usd(Number(stream.annualBudget ?? 0))}/yr, expansion ${stream.expansionBps}bps → ${(stream.domains || []).join(", ")}`,
    );
  }

  banner("Self-improvement kernel");
  const planDetails = config.selfImprovement?.plan;
  if (planDetails) {
    const cadenceHours = (Number(planDetails.cadenceSeconds ?? 0) / 3600).toFixed(2);
    console.log(`  Plan URI: ${planDetails.planURI}`);
    console.log(`  Plan hash: ${planDetails.planHash}`);
    console.log(`  Cadence: ${planDetails.cadenceSeconds}s (${cadenceHours}h)`);
    if (planDetails.lastExecutedAt) {
      console.log(`  Last executed at: ${new Date(Number(planDetails.lastExecutedAt) * 1000).toISOString()}`);
      console.log(`  Last report: ${planDetails.lastReportURI}`);
    }
  }
  for (const playbook of config.selfImprovement?.playbooks ?? []) {
    console.log(`  • ${playbook.name} (${playbook.automation}): ${playbook.description}`);
  }
  if (config.selfImprovement?.autonomyGuards) {
    const guards = config.selfImprovement.autonomyGuards;
    console.log(
      `  Autonomy guard: ≤${guards.maxAutonomyBps}bps autonomy, override ${guards.humanOverrideMinutes}m, escalation ${
        (guards.escalationChannels || []).join(" → ")
      }`,
    );
  }

  banner("Mermaid system map");
  console.log("```mermaid");
  console.log(mermaid(config));
  console.log("```");

  banner("Calldata");
  const data = calldata(config);
  Object.entries(data).forEach(([label, payload]) => {
    if (!payload) return;
    if (Array.isArray(payload)) {
      payload
        .filter((entry) => entry && typeof entry === "object" && entry.data)
        .forEach((entry) => {
          console.log(`  ${label} (${entry.slug}): ${entry.data}`);
        });
      return;
    }
    if (typeof payload === "object" && (payload as any).data) {
      console.log(`  ${label}: ${(payload as any).data}`);
      return;
    }
    console.log(`  ${label}: ${payload}`);
  });

  const exports = writeArtifacts(config, metrics, data);
  banner("Exports");
  exports.forEach((entry) => {
    console.log(`  ${entry.label}: ${entry.path}`);
  });

  banner("How to run");
  console.log("  1. Execute `npm ci` (first run only)");
  console.log("  2. Run `npm run demo:phase8:orchestrate`");
  console.log("  3. Paste emitted calldata into the governance console / Safe");
  console.log("  4. Open demo UI via `npx serve demo/Phase-8-Universal-Value-Dominance`");
})();
