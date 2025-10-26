#!/usr/bin/env ts-node
import { EventEmitter } from "events";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dayjs from "dayjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface JobSpec {
  jobName: string;
  maxDurationMinutes: number;
  autonomy: {
    checkpointIntervalMinutes: number;
    requireValidatorCheckIn: boolean;
    maxIdleMinutes: number;
  };
  economics: {
    maxBudgetUSD: number;
  };
  safety: {
    tripwires: string[];
    haltOnTripwire: boolean;
  };
}

interface CheckpointEvent {
  agent: string;
  checkpoint: string;
  costUSD: number;
  outputHash: string;
  timestamp: string;
}

class TripwireMonitor extends EventEmitter {
  private readonly spec: JobSpec;
  private spentUSD = 0;
  private lastCheckpoint = dayjs();

  constructor(spec: JobSpec) {
    super();
    this.spec = spec;
  }

  public record(event: CheckpointEvent) {
    this.spentUSD += event.costUSD;
    this.lastCheckpoint = dayjs(event.timestamp);
    this.emit("checkpoint", event);

    if (this.spentUSD > this.spec.economics.maxBudgetUSD) {
      this.emit("budgetExceeded", this.spentUSD);
    }
  }

  public evaluateIdle() {
    const idleMinutes = dayjs().diff(this.lastCheckpoint, "minute");
    if (idleMinutes > this.spec.autonomy.maxIdleMinutes) {
      this.emit("idleThreshold", idleMinutes);
    }
  }
}

async function readJobSpec(configPath: string): Promise<JobSpec> {
  const content = await fs.readFile(configPath, "utf8");
  return JSON.parse(content) as JobSpec;
}

async function appendLedger(jobName: string, event: CheckpointEvent) {
  const storageDir = path.resolve(process.cwd(), "storage", "phase8");
  await fs.mkdir(storageDir, { recursive: true });
  const file = path.join(storageDir, `${jobName}.jsonl`);
  await fs.appendFile(file, JSON.stringify(event) + "\n", "utf8");
}

async function main() {
  const configArg = process.argv.includes("--follow")
    ? process.argv[process.argv.indexOf("--follow") + 1]
    : "job.multi-agent.json";

  const spec = await readJobSpec(path.resolve(__dirname, "../configs", configArg));
  const monitor = new TripwireMonitor(spec);

  monitor.on("checkpoint", async (event) => {
    console.log(`[checkpoint] ${event.agent} -> ${event.checkpoint} cost=$${event.costUSD.toFixed(2)}`);
    await appendLedger(spec.jobName, event);
  });

  monitor.on("budgetExceeded", (spent) => {
    console.error(`[tripwire] Budget exceeded: spent $${spent.toFixed(2)} > max $${spec.economics.maxBudgetUSD}`);
    if (spec.safety.haltOnTripwire) {
      console.error("[tripwire] Requesting PauseGuardian intervention...");
    }
  });

  monitor.on("idleThreshold", (minutes) => {
    console.warn(`[tripwire] Agent idle for ${minutes} minutes. Dispatching validator ping.`);
  });

  console.log(`Monitoring job ${spec.jobName} with checkpoint interval ${spec.autonomy.checkpointIntervalMinutes} minutes`);

  // Mock event stream: in production replace with orchestrator websocket subscription.
  const sample: CheckpointEvent[] = [
    {
      agent: "planner",
      checkpoint: "blueprint",
      costUSD: 120.55,
      outputHash: "0xabc",
      timestamp: dayjs().toISOString()
    },
    {
      agent: "dev",
      checkpoint: "implementation",
      costUSD: 420.13,
      outputHash: "0xdef",
      timestamp: dayjs().add(20, "minute").toISOString()
    },
    {
      agent: "analyst",
      checkpoint: "market-report",
      costUSD: 89.42,
      outputHash: "0x123",
      timestamp: dayjs().add(40, "minute").toISOString()
    }
  ];

  for (const event of sample) {
    monitor.record(event);
  }

  // Simulate idle detection.
  setInterval(() => monitor.evaluateIdle(), spec.autonomy.maxIdleMinutes * 60 * 1000);
}

main().catch((error) => {
  console.error("Monitor failed:", error);
  process.exit(1);
});
