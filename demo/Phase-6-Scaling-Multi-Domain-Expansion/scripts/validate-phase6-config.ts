#!/usr/bin/env ts-node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { manifestSchema } from "./schema";

const MANIFEST_PATH = join(__dirname, "..", "config", "phase6.manifest.json");
const HTML_PATH = join(__dirname, "..", "index.html");
const README_PATH = join(__dirname, "..", "README.md");

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const manifest = manifestSchema.parse(raw);

  const slugs = new Set<string>();
  for (const domain of manifest.domains) {
    const slug = domain.slug.toLowerCase();
    ensure(!slugs.has(slug), `Duplicate domain slug detected: ${slug}`);
    slugs.add(slug);

    ensure(
      domain.operations.treasuryShareBps + domain.operations.circuitBreakerBps <= 10_000,
      `${domain.slug}: treasuryShareBps + circuitBreakerBps cannot exceed 100%`,
    );

    ensure(
      domain.operations.autopauseThresholdBps <= domain.operations.circuitBreakerBps,
      `${domain.slug}: autopauseThresholdBps must be below circuit breaker`,
    );

    ensure(
      Number(domain.operations.minStake) >= 1_000_000_000_000_000_000_000,
      `${domain.slug}: minStake must be at least 1,000 AGI (1e21 wei)`,
    );

    ensure(domain.agentTeams.some((team) => team.humanOversight.escalationMatrix.length >= 2), `${domain.slug}: at least one agent team requires multi-channel escalation matrix`);

    const l2 = manifest.l2Networks.find((network) => network.slug === domain.l2NetworkSlug);
    ensure(l2, `${domain.slug}: unknown l2NetworkSlug ${domain.l2NetworkSlug}`);
    ensure(l2?.gateway === domain.l2Gateway, `${domain.slug}: l2Gateway must match referenced network gateway`);

    ensure(
      domain.telemetry.resilienceBps >= manifest.globalTelemetry.resilienceFloorBps,
      `${domain.slug}: resilience telemetry below global floor`,
    );
    ensure(
      domain.telemetry.automationBps >= manifest.globalTelemetry.automationFloorBps,
      `${domain.slug}: automation telemetry below global floor`,
    );
  }

  ensure(
    manifest.domains.some((domain) => domain.operations.requiresHumanValidation),
    "At least one domain must enforce human validation",
  );

  ensure(
    manifest.domains.some((domain) => domain.agentTeams.some((team) => team.usesIoTOracles)),
    "At least one agent team must integrate IoT oracles",
  );

  const coverage = new Set<string>();
  for (const feed of manifest.oracleFeeds) {
    for (const domainSlug of feed.domains) {
      const normalized = domainSlug.toLowerCase();
      ensure(slugs.has(normalized), `Oracle feed ${feed.name} references unknown domain ${domainSlug}`);
      coverage.add(normalized);
    }
    ensure(feed.heartbeatSeconds <= manifest.global.l2SyncCadence, `${feed.name}: heartbeat must be <= L2 sync cadence`);
  }

  ensure(manifest.global.escalationBridge !== manifest.global.expansionManager, "Escalation bridge must differ from expansion manager to prevent recursion");
  ensure(manifest.global.escalationBridge !== manifest.global.owner, "Escalation bridge must be an automation target, not the owner safe");
  ensure(manifest.global.escalationBridge !== "0x0000000000000000000000000000000000000000", "Escalation bridge must be configured");

  for (const slug of slugs) {
    ensure(coverage.has(slug), `Domain ${slug} missing oracle feed coverage`);
  }

  const html = readFileSync(HTML_PATH, "utf-8");
  ensure(html.includes("Phase 6"), "index.html must highlight Phase 6");
  ensure(html.includes("mermaid"), "index.html must include a mermaid block");
  ensure(html.includes("AGI Jobs Phase 6 Command Nexus"), "index.html should render the command nexus headline");

  const readme = readFileSync(README_PATH, "utf-8");
  ensure(readme.includes("Phase 6"), "README must describe Phase 6 scenario");
  ensure(readme.includes("Phase6ExpansionManager"), "README must reference Phase6ExpansionManager contract");
  ensure(readme.includes("npm run owner:phase6:playbook"), "README must instruct owner control playbook usage");

  console.log("✅ Phase 6 manifest validated successfully");
  console.log(`• Domains: ${manifest.domains.length}`);
  console.log(`• Oracle feeds: ${manifest.oracleFeeds.length}`);
  console.log(`• Dashboards: ${manifest.dashboards.length}`);
}

main();
