#!/usr/bin/env ts-node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import prompts from "prompts";
import { Interface, keccak256, toUtf8Bytes } from "ethers";

const MANIFEST_PATH = resolve(__dirname, "../config/universal.value.manifest.json");
const OUTPUT_DIR = resolve(__dirname, "../output");
const OUTPUT_FILE = join(OUTPUT_DIR, "phase8-owner-batch.json");
const AUTO_MODE = process.argv.includes("--auto");

const MANAGER_ABI = [
  "function setGlobalParameters((address treasury,address universalVault,address upgradeCoordinator,address validatorRegistry,address missionControl,address knowledgeGraph,uint64 heartbeatSeconds,uint64 guardianReviewWindow,uint256 maxDrawdownBps,string manifestoURI,bytes32 manifestoHash) params)",
  "function setGuardianCouncil(address council)",
  "function setSystemPause(address pause)",
  "function setSelfImprovementPlan((string planURI,bytes32 planHash,uint64 cadenceSeconds,uint64 lastExecutedAt,string lastReportURI) plan)",
  "function forwardPauseCall(bytes data)",
];

const SYSTEM_PAUSE_ABI = ["function pauseAll()", "function unpauseAll()"];

const iface = new Interface(MANAGER_ABI);
const pauseIface = new Interface(SYSTEM_PAUSE_ABI);

type Manifest = {
  global?: {
    treasury?: string;
    universalVault?: string;
    upgradeCoordinator?: string;
    validatorRegistry?: string;
    missionControl?: string;
    knowledgeGraph?: string;
    guardianCouncil?: string;
    systemPause?: string;
    phase8Manager?: string;
    heartbeatSeconds?: number;
    guardianReviewWindow?: number;
    maxDrawdownBps?: number;
    manifestoURI?: string;
    manifestoHash?: string;
  };
  domains?: Array<{ autonomyLevelBps?: number; valueFlowMonthlyUSD?: number; resilienceIndex?: number }>;
  sentinels?: Array<{ coverageSeconds?: number }>;
  selfImprovement?: {
    plan?: { planURI?: string; planHash?: string; cadenceSeconds?: number; lastExecutedAt?: number; lastReportURI?: string };
    autonomyGuards?: { maxAutonomyBps?: number };
  };
};

type Transaction = {
  to: string;
  data: string;
  description: string;
};

function readManifest(): Manifest {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw);
}

function formatUSD(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function slugId(value: string): string {
  return keccak256(toUtf8Bytes(value.toLowerCase()));
}

function computeDominance(manifest: Manifest): { score: number; monthlyValue: number; sentinelCoverage: number; resilience: number } {
  const domains = manifest.domains ?? [];
  const sentinels = manifest.sentinels ?? [];
  const totalMonthlyUSD = domains.reduce((acc, domain) => acc + Number(domain.valueFlowMonthlyUSD ?? 0), 0);
  const averageResilience =
    domains.length === 0 ? 0 : domains.reduce((acc, domain) => acc + Number(domain.resilienceIndex ?? 0), 0) / domains.length;
  const coverageSeconds = sentinels.reduce((acc, sentinel) => acc + Number(sentinel.coverageSeconds ?? 0), 0);
  const guardianWindow = Number(manifest.global?.guardianReviewWindow ?? 0);
  const coverageRatio = guardianWindow > 0 ? Math.min(1, coverageSeconds / guardianWindow) : 0;
  const maxAutonomy = domains.reduce((max, domain) => Math.max(max, Number(domain.autonomyLevelBps ?? 0)), 0);
  const guardCap = Number(manifest.selfImprovement?.autonomyGuards?.maxAutonomyBps ?? 10000);
  const cadenceSeconds = Number(manifest.selfImprovement?.plan?.cadenceSeconds ?? 0);
  const valueScore = totalMonthlyUSD <= 0 ? 0 : Math.min(1, totalMonthlyUSD / 500_000_000_000);
  const coverageScore = Math.min(1, coverageRatio);
  const autonomyScore = guardCap > 0 ? Math.min(1, maxAutonomy / guardCap) : 1;
  const cadenceScore = cadenceSeconds > 0 ? Math.max(0, 1 - Math.min(1, cadenceSeconds / (24 * 60 * 60))) : 0.5;
  const weighted = 0.35 * valueScore + 0.25 * averageResilience + 0.2 * coverageScore + 0.2 * cadenceScore * autonomyScore;
  return {
    score: Math.min(100, Math.round(weighted * 1000) / 10),
    monthlyValue: totalMonthlyUSD,
    sentinelCoverage: coverageSeconds,
    resilience: averageResilience,
  };
}

function ensureAddress(address: string | undefined, label: string): string {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`Invalid ${label} address. Found: ${address ?? "undefined"}`);
  }
  return address.toLowerCase();
}

function toUint(value: number | undefined, fallback = 0): bigint {
  if (!Number.isFinite(value as number)) return BigInt(fallback);
  return BigInt(Math.max(0, Math.trunc(value as number)));
}

async function main() {
  const manifest = readManifest();
  const managerAddress = ensureAddress(manifest.global?.phase8Manager, "Phase8 manager");
  const dominance = computeDominance(manifest);

  console.log("\n=== Phase 8 Owner Command Console ===\n");
  console.log(`Manager contract: ${managerAddress}`);
  console.log(`Guardian council: ${manifest.global?.guardianCouncil ?? "unknown"}`);
  console.log(`System pause: ${manifest.global?.systemPause ?? "unknown"}`);
  console.log(`Dominance index: ${dominance.score.toFixed(1)}`);
  console.log(`Monthly value routed: ${formatUSD(dominance.monthlyValue)}`);
  console.log(`Avg resilience: ${(dominance.resilience * 100).toFixed(2)}%`);
  console.log(`Sentinel coverage: ${(dominance.sentinelCoverage / 60).toFixed(1)} minutes\n`);

  const pending: Transaction[] = [];

  if (AUTO_MODE) {
    console.log("Auto mode enabled — generating owner batch from manifest defaults.\n");
    const globalsData = iface.encodeFunctionData("setGlobalParameters", [
      {
        treasury: ensureAddress(manifest.global?.treasury, "treasury"),
        universalVault: ensureAddress(manifest.global?.universalVault, "universalVault"),
        upgradeCoordinator: ensureAddress(manifest.global?.upgradeCoordinator, "upgradeCoordinator"),
        validatorRegistry: ensureAddress(manifest.global?.validatorRegistry, "validatorRegistry"),
        missionControl: ensureAddress(manifest.global?.missionControl, "missionControl"),
        knowledgeGraph: ensureAddress(manifest.global?.knowledgeGraph, "knowledgeGraph"),
        heartbeatSeconds: toUint(manifest.global?.heartbeatSeconds, 600),
        guardianReviewWindow: toUint(manifest.global?.guardianReviewWindow, 900),
        maxDrawdownBps: toUint(manifest.global?.maxDrawdownBps, 5000),
        manifestoURI: String(manifest.global?.manifestoURI ?? ""),
        manifestoHash: String(manifest.global?.manifestoHash ?? "0x"),
      },
    ]);
    pending.push({
      to: managerAddress,
      data: globalsData,
      description: "Update Phase 8 global parameters",
    });

    if (manifest.selfImprovement?.plan) {
      const plan = manifest.selfImprovement.plan;
      const planData = iface.encodeFunctionData("setSelfImprovementPlan", [
        {
          planURI: String(plan.planURI ?? ""),
          planHash: String(plan.planHash ?? "0x"),
          cadenceSeconds: toUint(plan.cadenceSeconds, 7200),
          lastExecutedAt: toUint(plan.lastExecutedAt, Math.floor(Date.now() / 1000)),
          lastReportURI: String(plan.lastReportURI ?? ""),
        },
      ]);
      pending.push({
        to: managerAddress,
        data: planData,
        description: "Refresh self-improvement plan",
      });
    }

    const pauseCall = pauseIface.encodeFunctionData("pauseAll");
    pending.push({
      to: managerAddress,
      data: iface.encodeFunctionData("forwardPauseCall", [pauseCall]),
      description: "Pause entire platform",
    });
  } else {
    const menuChoices = [
      { title: "Update global parameters", value: "globals" },
      { title: "Schedule self-improvement plan", value: "plan" },
      { title: "Pause or resume the platform", value: "pause" },
      { title: "Exit", value: "exit" },
    ];

    let exitRequested = false;
    while (!exitRequested) {
      const { action } = await prompts({
        type: "select",
        name: "action",
        message: "Select an owner action",
        choices: menuChoices,
        initial: 0,
      });

      switch (action) {
        case "globals": {
          const responses = await prompts([
          {
            type: "text",
            name: "treasury",
            message: "Treasury address",
            initial: manifest.global?.treasury ?? "",
            validate: (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value) || "Enter a valid address",
          },
          {
            type: "text",
            name: "universalVault",
            message: "Universal vault",
            initial: manifest.global?.universalVault ?? "",
            validate: (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value) || "Enter a valid address",
          },
          {
            type: "number",
            name: "heartbeatSeconds",
            message: "Heartbeat seconds",
            initial: manifest.global?.heartbeatSeconds ?? 600,
            min: 60,
          },
          {
            type: "number",
            name: "guardianReviewWindow",
            message: "Guardian review window (seconds)",
            initial: manifest.global?.guardianReviewWindow ?? 900,
            min: 120,
          },
          {
            type: "number",
            name: "maxDrawdownBps",
            message: "Max drawdown (bps)",
            initial: manifest.global?.maxDrawdownBps ?? 5000,
            min: 0,
            max: 10_000,
          },
          {
            type: "text",
            name: "manifestoURI",
            message: "Manifesto URI",
            initial: manifest.global?.manifestoURI ?? "",
          },
          {
            type: "text",
            name: "manifestoHash",
            message: "Manifesto hash (0x...)",
            initial: manifest.global?.manifestoHash ?? "0x",
            validate: (value: string) => /^0x[a-fA-F0-9]{64}$/.test(value) || "Enter a 32-byte hash",
          },
        ]);

        const data = iface.encodeFunctionData("setGlobalParameters", [
          {
            treasury: ensureAddress(responses.treasury, "treasury"),
            universalVault: ensureAddress(responses.universalVault, "universalVault"),
            upgradeCoordinator: ensureAddress(manifest.global?.upgradeCoordinator, "upgradeCoordinator"),
            validatorRegistry: ensureAddress(manifest.global?.validatorRegistry, "validatorRegistry"),
            missionControl: ensureAddress(manifest.global?.missionControl, "missionControl"),
            knowledgeGraph: ensureAddress(manifest.global?.knowledgeGraph, "knowledgeGraph"),
            heartbeatSeconds: toUint(responses.heartbeatSeconds ?? manifest.global?.heartbeatSeconds),
            guardianReviewWindow: toUint(responses.guardianReviewWindow ?? manifest.global?.guardianReviewWindow),
            maxDrawdownBps: toUint(responses.maxDrawdownBps ?? manifest.global?.maxDrawdownBps),
            manifestoURI: String(responses.manifestoURI ?? manifest.global?.manifestoURI ?? ""),
            manifestoHash: responses.manifestoHash ?? manifest.global?.manifestoHash ?? "0x",
          },
        ]);

        pending.push({
          to: managerAddress,
          data,
          description: "Update Phase 8 global parameters",
        });

          console.log("• Added global parameter update to batch.");
          break;
        }

        case "plan": {
          const responses = await prompts([
          {
            type: "text",
            name: "planURI",
            message: "Self-improvement plan URI",
            initial: manifest.selfImprovement?.plan?.planURI ?? "",
          },
          {
            type: "text",
            name: "planHash",
            message: "Plan hash (0x...)",
            initial: manifest.selfImprovement?.plan?.planHash ?? "0x",
            validate: (value: string) => /^0x[a-fA-F0-9]{64}$/.test(value) || "Enter a 32-byte hash",
          },
          {
            type: "number",
            name: "cadenceSeconds",
            message: "Execution cadence (seconds)",
            initial: manifest.selfImprovement?.plan?.cadenceSeconds ?? 7200,
            min: 600,
          },
          {
            type: "number",
            name: "lastExecutedAt",
            message: "Last executed at (unix timestamp)",
            initial: manifest.selfImprovement?.plan?.lastExecutedAt ?? Math.floor(Date.now() / 1000),
            min: 0,
          },
          {
            type: "text",
            name: "lastReportURI",
            message: "Last report URI",
            initial: manifest.selfImprovement?.plan?.lastReportURI ?? "",
          },
        ]);

        const data = iface.encodeFunctionData("setSelfImprovementPlan", [
          {
            planURI: String(responses.planURI ?? ""),
            planHash: String(responses.planHash ?? "0x"),
            cadenceSeconds: toUint(responses.cadenceSeconds ?? manifest.selfImprovement?.plan?.cadenceSeconds, 7200),
            lastExecutedAt: toUint(responses.lastExecutedAt ?? Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)),
            lastReportURI: String(responses.lastReportURI ?? ""),
          },
        ]);

        pending.push({
          to: managerAddress,
          data,
          description: "Set self-improvement plan",
        });
          console.log("• Added self-improvement update to batch.");
          break;
        }

        case "pause": {
          const { mode } = await prompts({
          type: "select",
          name: "mode",
          message: "Select pause command",
          choices: [
            { title: "Pause all modules", value: "pause" },
            { title: "Resume all modules", value: "resume" },
          ],
        });

        const pauseCall = mode === "pause" ? pauseIface.encodeFunctionData("pauseAll") : pauseIface.encodeFunctionData("unpauseAll");
        const data = iface.encodeFunctionData("forwardPauseCall", [pauseCall]);
        pending.push({
          to: managerAddress,
          data,
          description: mode === "pause" ? "Pause entire platform" : "Resume entire platform",
        });
        console.log(`• Added ${mode} command to batch.`);
          break;
        }

        default:
          exitRequested = true;
          break;
      }
    }
  }

  if (pending.length === 0) {
    console.log("No actions selected. Nothing to write.");
    return;
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    manager: manifest.global?.phase8Manager,
    guardianCouncil: manifest.global?.guardianCouncil,
    systemPause: manifest.global?.systemPause,
    transactions: pending,
    hints: {
      safe: {
        target: managerAddress,
        description: "Import into Safe / Governor as a batch to maintain deterministic ordering.",
      },
      calldata: pending.map((tx) => ({ description: tx.description, data: tx.data })),
    },
    analytics: computeDominance(manifest),
    manifestHash: slugId(JSON.stringify(manifest)),
  };

  writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`\nSaved ${pending.length} transaction(s) to ${OUTPUT_FILE}`);
  console.log("Broadcast through your owner proxy or multisig to execute the plan.");
}

main().catch((error) => {
  console.error("Owner console failed:", error);
  process.exit(1);
});
