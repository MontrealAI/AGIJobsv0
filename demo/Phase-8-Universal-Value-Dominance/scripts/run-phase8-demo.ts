#!/usr/bin/env ts-node
/*
 * Phase 8 — Universal Value Dominance orchestration console.
 * Loads the manifest, synthesises calldata for governance, and emits a
 * ready-to-copy runbook for non-technical operators.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Interface, keccak256, toUtf8Bytes } from "ethers";

const CONFIG_PATH = join(__dirname, "..", "config", "universal.value.manifest.json");

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
  return { totalMonthlyUSD, maxAutonomy, averageResilience, guardianCoverageMinutes, annualBudget, coverageRatio };
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
    "function removeDomain(bytes32 id)",
    "function removeSentinel(bytes32 id)",
    "function removeCapitalStream(bytes32 id)"
  ]);

  const global = config.global ?? {};
  const firstDomain = config.domains?.[0];
  const firstSentinel = config.sentinels?.[0];
  const firstStream = config.capitalStreams?.[0];
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
    domain: firstDomain
      ? [
          firstDomain.slug,
          firstDomain.name,
          firstDomain.metadataURI,
          firstDomain.orchestrator,
          firstDomain.capitalVault,
          firstDomain.validatorModule,
          firstDomain.policyKernel,
          BigInt(firstDomain.heartbeatSeconds ?? 0),
          BigInt(firstDomain.tvlLimit ?? 0),
          BigInt(firstDomain.autonomyLevelBps ?? 0),
          Boolean(firstDomain.active),
        ]
      : undefined,
    sentinel: firstSentinel
      ? [
          firstSentinel.slug,
          firstSentinel.name,
          firstSentinel.uri,
          firstSentinel.agent,
          BigInt(firstSentinel.coverageSeconds ?? 0),
          BigInt(firstSentinel.sensitivityBps ?? 0),
          Boolean(firstSentinel.active),
        ]
      : undefined,
    stream: firstStream
      ? [
          firstStream.slug,
          firstStream.name,
          firstStream.uri,
          firstStream.vault,
          BigInt(firstStream.annualBudget ?? 0),
          BigInt(firstStream.expansionBps ?? 0),
          Boolean(firstStream.active),
        ]
      : undefined,
  };

  const domainRemoval = firstDomain ? iface.encodeFunctionData("removeDomain", [slugId(String(firstDomain.slug || ""))]) : undefined;
  const sentinelRemoval = firstSentinel
    ? iface.encodeFunctionData("removeSentinel", [slugId(String(firstSentinel.slug || ""))])
    : undefined;
  const streamRemoval = firstStream
    ? iface.encodeFunctionData("removeCapitalStream", [slugId(String(firstStream.slug || ""))])
    : undefined;

  return {
    setGlobalParameters: iface.encodeFunctionData("setGlobalParameters", [tuples.global]),
    setGuardianCouncil: iface.encodeFunctionData("setGuardianCouncil", [tuples.guardian ?? "0x0000000000000000000000000000000000000000"]),
    setSystemPause: iface.encodeFunctionData("setSystemPause", [tuples.pause ?? "0x0000000000000000000000000000000000000000"]),
    registerDomain: tuples.domain ? iface.encodeFunctionData("registerDomain", [tuples.domain]) : undefined,
    registerSentinel: tuples.sentinel ? iface.encodeFunctionData("registerSentinel", [tuples.sentinel]) : undefined,
    registerCapitalStream: tuples.stream ? iface.encodeFunctionData("registerCapitalStream", [tuples.stream]) : undefined,
    setSentinelDomains:
      sentinelDomains.length > 0
        ? iface.encodeFunctionData("setSentinelDomains", [sentinelDomains[0].id, sentinelDomains[0].domains])
        : undefined,
    setCapitalStreamDomains:
      streamDomains.length > 0
        ? iface.encodeFunctionData("setCapitalStreamDomains", [streamDomains[0].id, streamDomains[0].domains])
        : undefined,
    removeDomain: domainRemoval,
    removeSentinel: sentinelRemoval,
    removeCapitalStream: streamRemoval,
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

  banner("How to run");
  console.log("  1. Execute `npm ci` (first run only)");
  console.log("  2. Run `npm run demo:phase8:orchestrate`");
  console.log("  3. Paste emitted calldata into the governance console / Safe");
  console.log("  4. Open demo UI via `npx serve demo/Phase-8-Universal-Value-Dominance`");
})();
