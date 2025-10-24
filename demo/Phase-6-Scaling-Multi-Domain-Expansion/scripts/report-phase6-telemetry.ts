#!/usr/bin/env ts-node
import { promises as fs } from "fs";
import path from "path";
import { manifestSchema, type Phase6Manifest } from "./schema";

const OUTPUT_DIR = path.join(__dirname, "..", "output");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "phase6-telemetry.json");

async function loadManifest(): Promise<Phase6Manifest> {
  const manifestPath = path.join(__dirname, "..", "config", "phase6.manifest.json");
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  return manifestSchema.parse(raw);
}

function summarize(manifest: Phase6Manifest) {
  const domains = manifest.domains.map((domain) => ({
    slug: domain.slug,
    name: domain.name,
    active: domain.active,
    resilienceBps: domain.telemetry.resilienceBps,
    automationBps: domain.telemetry.automationBps,
    complianceBps: domain.telemetry.complianceBps,
    settlementLatencySeconds: domain.telemetry.settlementLatencySeconds,
    l2Network: domain.l2NetworkSlug,
    sentinelOracle: domain.telemetry.sentinelOracle,
    usesIoT: domain.agentTeams.some((team) => team.usesIoTOracles),
    requiresHumanValidation: domain.operations.requiresHumanValidation,
  }));

  const automationAverage =
    domains.reduce((acc, domain) => acc + domain.automationBps, 0) / Math.max(domains.length, 1);

  const resilienceAverage =
    domains.reduce((acc, domain) => acc + domain.resilienceBps, 0) / Math.max(domains.length, 1);

  const complianceAverage =
    domains.reduce((acc, domain) => acc + domain.complianceBps, 0) / Math.max(domains.length, 1);

  const settlementMedian = [...domains]
    .map((domain) => domain.settlementLatencySeconds)
    .sort((a, b) => a - b);
  const mid = Math.floor(settlementMedian.length / 2);
  const latencyMedian =
    settlementMedian.length % 2 === 0
      ? (settlementMedian[mid - 1] + settlementMedian[mid]) / 2
      : settlementMedian[mid] ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    manifestURI: manifest.global.manifestURI,
    owner: manifest.global.owner,
    governanceMultisig: manifest.global.governanceMultisig,
    metrics: {
      resilienceFloorBps: manifest.globalTelemetry.resilienceFloorBps,
      automationFloorBps: manifest.globalTelemetry.automationFloorBps,
      oversightWeightBps: manifest.globalTelemetry.oversightWeightBps,
      anomalyGracePeriod: manifest.globalGuards.anomalyGracePeriod,
      resilienceAverageBps: Math.round(resilienceAverage),
      automationAverageBps: Math.round(automationAverage),
      complianceAverageBps: Math.round(complianceAverage),
      settlementMedianSeconds: latencyMedian,
    },
    domains,
    oracleFeeds: manifest.oracleFeeds.map((feed) => ({
      name: feed.name,
      endpoint: feed.endpoint,
      heartbeatSeconds: feed.heartbeatSeconds,
      domains: feed.domains,
    })),
  };
}

async function main() {
  const manifest = await loadManifest();
  const summary = summarize(manifest);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(summary, null, 2), "utf-8");

  console.log("Phase 6 Telemetry Snapshot");
  console.log(`Generated: ${summary.generatedAt}`);
  console.log(`Owner: ${summary.owner}`);
  console.log(`Manifest URI: ${summary.manifestURI}`);
  console.log("Key Metrics:");
  console.log(
    `  Resilience floor ${(summary.metrics.resilienceFloorBps / 100).toFixed(2)}% | Automation floor ${(summary.metrics.automationFloorBps / 100).toFixed(2)}% | Oversight weight ${(summary.metrics.oversightWeightBps / 100).toFixed(2)}%`
  );
  console.log(
    `  Averages -> Resilience ${(summary.metrics.resilienceAverageBps / 100).toFixed(2)}% | Automation ${(summary.metrics.automationAverageBps / 100).toFixed(2)}% | Compliance ${(summary.metrics.complianceAverageBps / 100).toFixed(2)}%`
  );
  console.log(`  Settlement median ${summary.metrics.settlementMedianSeconds}s | Anomaly grace ${summary.metrics.anomalyGracePeriod}s`);
  console.log("Domain Overview:");
  for (const domain of summary.domains) {
    console.log(
      `  - ${domain.slug}: active=${domain.active} IoT=${domain.usesIoT} humanValidation=${domain.requiresHumanValidation} resilience ${(domain.resilienceBps / 100).toFixed(2)}% automation ${(domain.automationBps / 100).toFixed(2)}%`
    );
  }
  console.log(`Snapshot written to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(`Phase 6 telemetry reporter failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
