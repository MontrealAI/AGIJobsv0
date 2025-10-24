#!/usr/bin/env ts-node
import { promises as fs } from "fs";
import path from "path";
import { Interface, ZeroAddress, keccak256, toUtf8Bytes } from "ethers";
import { manifestSchema, type Phase6Manifest } from "../../demo/Phase-6-Scaling-Multi-Domain-Expansion/scripts/schema";

interface CliOptions {
  network?: string;
  format: "human" | "markdown" | "json";
  outPath?: string;
  action?: "pause" | "resume" | "escalate" | "status";
  topic?: string;
  help?: boolean;
}

interface SafeTransaction {
  to: string;
  data: string;
  value: string;
  description: string;
}

interface Playbook {
  generatedAt: string;
  network: string;
  manifestURI: string;
  owner: string;
  governanceMultisig: string;
  expansionManager: string;
  systemPause: string;
  escalationBridge: string;
  docs: string[];
  readiness: {
    resilienceFloorBps: number;
    automationFloorBps: number;
    oversightWeightBps: number;
    oracleCoverage: number;
    humanValidationDomains: string[];
  };
  domains: Array<{
    slug: string;
    name: string;
    active: boolean;
    l2Network: string;
    treasuryShareBps: number;
    circuitBreakerBps: number;
    autopauseThresholdBps: number;
    requiresHumanValidation: boolean;
    telemetry: {
      resilienceBps: number;
      automationBps: number;
      complianceBps: number;
      settlementLatencySeconds: number;
    };
  }>;
  transactions: SafeTransaction[];
}

const PHASE6_ABI = [
  "function forwardPauseCall(bytes data) external returns (bytes)",
  "function forwardEscalation(bytes data) external returns (bytes)",
  "function domainId(string slug) external pure returns (bytes32)",
  "function setDomainStatus(bytes32 id, bool active) external",
  "function setGlobalConfig((address,address,address,address,uint64,string) config) external",
  "function setGlobalGuards((uint16,uint16,uint32,bool,address) config) external",
  "function setGlobalTelemetry((bytes32,bytes32,uint32,uint32,uint32) telemetry) external"
];

const SYSTEM_PAUSE_ABI = ["function pauseAll()", "function unpauseAll()"];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { format: "human" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--network": {
        const value = argv[i + 1];
        if (!value) throw new Error("--network requires a value");
        options.network = value;
        i += 1;
        break;
      }
      case "--format": {
        const value = argv[i + 1];
        if (!value) throw new Error("--format requires a value");
        if (!["human", "markdown", "json"].includes(value)) {
          throw new Error(`Unsupported format ${value}`);
        }
        options.format = value as CliOptions["format"];
        i += 1;
        break;
      }
      case "--out":
      case "--output": {
        const value = argv[i + 1];
        if (!value) throw new Error(`${arg} requires a path`);
        options.outPath = value;
        i += 1;
        break;
      }
      case "--action": {
        const value = argv[i + 1];
        if (!value) throw new Error("--action requires a value");
        if (!["pause", "resume", "escalate", "status"].includes(value)) {
          throw new Error(`Unsupported action ${value}`);
        }
        options.action = value as CliOptions["action"];
        i += 1;
        break;
      }
      case "--topic": {
        const value = argv[i + 1];
        if (!value) throw new Error("--topic requires a value");
        options.topic = value;
        i += 1;
        break;
      }
      default:
        break;
    }
  }
  return options;
}

function usage(): string {
  return "Phase 6 Expansion Playbook\n\n" +
    "Usage: npm run owner:phase6:playbook [-- --network sepolia --format markdown --action pause]\n\n" +
    "Options:\n" +
    "  --network <name>    Target network label for context (default: localnet)\n" +
    "  --format <mode>     human | markdown | json (default: human)\n" +
    "  --action <type>     pause | resume | escalate | status (default: all)\n" +
    "  --topic <value>     Escalation topic (required for --action escalate)\n" +
    "  --out <file>        Write output to file in addition to stdout\n";
}

async function loadManifest(): Promise<Phase6Manifest> {
  const manifestPath = path.join(
    __dirname,
    "..",
    "..",
    "demo",
    "Phase-6-Scaling-Multi-Domain-Expansion",
    "config",
    "phase6.manifest.json"
  );
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  return manifestSchema.parse(raw);
}

function buildTransactions(manifest: Phase6Manifest, options: CliOptions): SafeTransaction[] {
  const phase6 = new Interface(PHASE6_ABI);
  const systemPause = new Interface(SYSTEM_PAUSE_ABI);

  const transactions: SafeTransaction[] = [];
  if (!options.action || options.action === "pause") {
    const pauseData = phase6.encodeFunctionData("forwardPauseCall", [systemPause.encodeFunctionData("pauseAll")]);
    transactions.push({
      to: manifest.global.expansionManager,
      data: pauseData,
      value: "0",
      description: "Forward pauseAll() to SystemPause and freeze all core modules"
    });
  }

  if (!options.action || options.action === "resume") {
    const resumeData = phase6.encodeFunctionData("forwardPauseCall", [systemPause.encodeFunctionData("unpauseAll")]);
    transactions.push({
      to: manifest.global.expansionManager,
      data: resumeData,
      value: "0",
      description: "Forward unpauseAll() to SystemPause and resume operations"
    });
  }

  const shouldIncludeGuards = !options.action || options.action === "status";

  if (shouldIncludeGuards && manifest.global.treasuryBridge !== ZeroAddress) {
    const guardsCall = phase6.encodeFunctionData("setGlobalGuards", [[
      manifest.globalGuards.treasuryBufferBps,
      manifest.globalGuards.circuitBreakerBps,
      manifest.globalGuards.anomalyGracePeriod,
      manifest.globalGuards.autoPauseEnabled,
      manifest.globalGuards.oversightCouncil
    ]]);
    transactions.push({
      to: manifest.global.expansionManager,
      data: guardsCall,
      value: "0",
      description: "Reaffirm global guard rails (treasury buffers, anomaly grace period)"
    });
  }

  if (options.action === "escalate") {
    if (!options.topic) {
      throw new Error("--topic is required when --action escalate is used");
    }
    const digest = keccak256(toUtf8Bytes(options.topic));
    const escalationPayload = phase6.encodeFunctionData("forwardEscalation", [digest]);
    transactions.push({
      to: manifest.global.expansionManager,
      data: escalationPayload,
      value: "0",
      description: `Forward escalation digest for topic '${options.topic}' to the escalation bridge`
    });
  }

  return transactions;
}

function buildPlaybook(manifest: Phase6Manifest, options: CliOptions): Playbook {
  const oracleCoverage = manifest.oracleFeeds.reduce((acc, feed) => acc + feed.domains.length, 0);
  const humanValidationDomains = manifest.domains
    .filter((domain) => domain.operations.requiresHumanValidation)
    .map((domain) => domain.slug);

  const transactions = buildTransactions(manifest, options);

  return {
    generatedAt: new Date().toISOString(),
    network: options.network ?? "localnet",
    manifestURI: manifest.global.manifestURI,
    owner: manifest.global.owner,
    governanceMultisig: manifest.global.governanceMultisig,
    expansionManager: manifest.global.expansionManager,
    systemPause: manifest.global.systemPause,
    escalationBridge: manifest.global.escalationBridge,
    docs: manifest.global.docs,
    readiness: {
      resilienceFloorBps: manifest.globalTelemetry.resilienceFloorBps,
      automationFloorBps: manifest.globalTelemetry.automationFloorBps,
      oversightWeightBps: manifest.globalTelemetry.oversightWeightBps,
      oracleCoverage,
      humanValidationDomains
    },
    domains: manifest.domains.map((domain) => ({
      slug: domain.slug,
      name: domain.name,
      active: domain.active,
      l2Network: domain.l2NetworkSlug,
      treasuryShareBps: domain.operations.treasuryShareBps,
      circuitBreakerBps: domain.operations.circuitBreakerBps,
      autopauseThresholdBps: domain.operations.autopauseThresholdBps,
      requiresHumanValidation: domain.operations.requiresHumanValidation,
      telemetry: {
        resilienceBps: domain.telemetry.resilienceBps,
        automationBps: domain.telemetry.automationBps,
        complianceBps: domain.telemetry.complianceBps,
        settlementLatencySeconds: domain.telemetry.settlementLatencySeconds
      }
    })),
    transactions
  };
}

function renderHuman(playbook: Playbook): string {
  const lines: string[] = [];
  lines.push("PHASE 6 EXPANSION PLAYBOOK");
  lines.push(`Generated: ${playbook.generatedAt}`);
  lines.push(`Network: ${playbook.network}`);
  lines.push("");
  lines.push(`Owner Safe: ${playbook.owner}`);
  lines.push(`Governance Multisig: ${playbook.governanceMultisig}`);
  lines.push(`Expansion Manager: ${playbook.expansionManager}`);
  lines.push(`System Pause: ${playbook.systemPause}`);
  lines.push(`Escalation Bridge: ${playbook.escalationBridge}`);
  lines.push("");
  lines.push("Global Readiness:");
  lines.push(`  Resilience floor: ${(playbook.readiness.resilienceFloorBps / 100).toFixed(2)}%`);
  lines.push(`  Automation floor: ${(playbook.readiness.automationFloorBps / 100).toFixed(2)}%`);
  lines.push(`  Oversight weighting: ${(playbook.readiness.oversightWeightBps / 100).toFixed(2)}%`);
  lines.push(`  Oracle coverage entries: ${playbook.readiness.oracleCoverage}`);
  lines.push(`  Domains requiring human validation: ${playbook.readiness.humanValidationDomains.join(", ")}`);
  lines.push("");
  for (const domain of playbook.domains) {
    lines.push(`Domain — ${domain.name} (${domain.slug})`);
    lines.push(`  Active: ${domain.active}`);
    lines.push(`  L2: ${domain.l2Network}`);
    lines.push(`  Treasury share: ${(domain.treasuryShareBps / 100).toFixed(2)}%`);
    lines.push(`  Circuit breaker: ${(domain.circuitBreakerBps / 100).toFixed(2)}%`);
    lines.push(`  Autopause threshold: ${(domain.autopauseThresholdBps / 100).toFixed(2)}%`);
    lines.push(`  Requires human validation: ${domain.requiresHumanValidation}`);
    lines.push(
      `  Telemetry: resilience ${(domain.telemetry.resilienceBps / 100).toFixed(2)}%, automation ${(domain.telemetry.automationBps / 100).toFixed(2)}%, compliance ${(domain.telemetry.complianceBps / 100).toFixed(2)}%, latency ${domain.telemetry.settlementLatencySeconds}s`
    );
    lines.push("");
  }
  lines.push("Prepared Transactions:");
  playbook.transactions.forEach((tx, index) => {
    lines.push(`  [${index + 1}] ${tx.description}`);
    lines.push(`      to:   ${tx.to}`);
    lines.push(`      data: ${tx.data}`);
    lines.push("      value: 0");
  });
  lines.push("");
  lines.push("Docs:");
  playbook.docs.forEach((doc) => lines.push(`  - ${doc}`));
  return lines.join("\n");
}

function renderMarkdown(playbook: Playbook): string {
  const domainRows = playbook.domains
    .map((domain) => {
      const resilience = (domain.telemetry.resilienceBps / 100).toFixed(2);
      const automation = (domain.telemetry.automationBps / 100).toFixed(2);
      const compliance = (domain.telemetry.complianceBps / 100).toFixed(2);
      return `| ${domain.slug} | ${domain.active ? "✅" : "⛔️"} | ${domain.l2Network} | ${resilience}% | ${automation}% | ${compliance}% | ${domain.telemetry.settlementLatencySeconds}s |`;
    })
    .join("\n");

  const transactionRows = playbook.transactions
    .map((tx, index) => `| ${index + 1} | ${tx.description} | \`${tx.to}\` | \`${tx.data}\` |`)
    .join("\n");

  return `# Phase 6 Expansion Playbook\n\n` +
    `- Generated: ${playbook.generatedAt}\n` +
    `- Network: ${playbook.network}\n` +
    `- Owner Safe: \`${playbook.owner}\`\n` +
    `- Governance Multisig: \`${playbook.governanceMultisig}\`\n` +
    `- Expansion Manager: \`${playbook.expansionManager}\`\n` +
    `- System Pause: \`${playbook.systemPause}\`\n` +
    `- Escalation Bridge: \`${playbook.escalationBridge}\`\n\n` +
    `## Global Readiness\n` +
    `- Resilience floor: ${(playbook.readiness.resilienceFloorBps / 100).toFixed(2)}%\n` +
    `- Automation floor: ${(playbook.readiness.automationFloorBps / 100).toFixed(2)}%\n` +
    `- Oversight weighting: ${(playbook.readiness.oversightWeightBps / 100).toFixed(2)}%\n` +
    `- Oracle coverage entries: ${playbook.readiness.oracleCoverage}\n` +
    `- Human validation domains: ${playbook.readiness.humanValidationDomains.join(", ")}\n\n` +
    `## Domain Snapshot\n` +
    `| Slug | Active | L2 | Resilience | Automation | Compliance | Latency |\n` +
    `| --- | --- | --- | --- | --- | --- | --- |\n` +
    `${domainRows}\n\n` +
    `## Prepared Transactions\n` +
    `| # | Description | To | Data |\n` +
    `| --- | --- | --- | --- |\n` +
    `${transactionRows}\n\n` +
    `## Reference Docs\n` +
    playbook.docs.map((doc) => `- ${doc}`).join("\n") + "\n";
}

async function writeIfNeeded(options: CliOptions, payload: string) {
  if (!options.outPath) return;
  const target = path.isAbsolute(options.outPath) ? options.outPath : path.join(process.cwd(), options.outPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, payload, "utf-8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const manifest = await loadManifest();
  const playbook = buildPlaybook(manifest, options);

  let rendered: string;
  switch (options.format) {
    case "json":
      rendered = JSON.stringify(playbook, null, 2);
      break;
    case "markdown":
      rendered = renderMarkdown(playbook);
      break;
    default:
      rendered = renderHuman(playbook);
      break;
  }

  if (options.outPath) {
    await writeIfNeeded(options, rendered);
  }

  console.log(rendered);
}

main().catch((error) => {
  console.error(`Phase 6 playbook failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
