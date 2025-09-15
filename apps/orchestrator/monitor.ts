import fs from 'fs';
import path from 'path';
import { auditLog } from './audit';

export interface AgentHealthStatus {
  agentId: string;
  failures: number;
  lastFailureAt?: string;
  lastFailureReason?: string;
  quarantinedUntil?: string | null;
  lastResetAt?: string;
}

interface WatchdogState {
  [agentId: string]: AgentHealthStatus;
}

interface WatchdogOptions {
  failureThreshold: number;
  quarantineMs: number;
  stateFile: string;
}

const DEFAULT_FAILURE_THRESHOLD = Number(
  process.env.WATCHDOG_FAILURE_THRESHOLD ?? 3
);
const DEFAULT_QUARANTINE_MS = Number(
  process.env.WATCHDOG_QUARANTINE_MS ?? 15 * 60 * 1000
);
const DEFAULT_STATE_FILE =
  process.env.WATCHDOG_STATE_FILE ||
  path.resolve(__dirname, '../../storage/orchestrator-watchdog.json');

function ensureStateDirectory(file: string): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export class Watchdog {
  private readonly options: WatchdogOptions;
  private readonly state: WatchdogState;

  constructor(options?: Partial<WatchdogOptions>) {
    this.options = {
      failureThreshold: options?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD,
      quarantineMs: options?.quarantineMs ?? DEFAULT_QUARANTINE_MS,
      stateFile: options?.stateFile
        ? path.resolve(options.stateFile)
        : path.resolve(DEFAULT_STATE_FILE),
    };
    this.state = this.load();
  }

  private now(): Date {
    return new Date();
  }

  private load(): WatchdogState {
    const file = this.options.stateFile;
    if (!fs.existsSync(file)) {
      ensureStateDirectory(file);
      return {};
    }
    try {
      const raw = fs.readFileSync(file, 'utf8');
      if (!raw) return {};
      const parsed = JSON.parse(raw) as WatchdogState;
      return parsed;
    } catch (err) {
      console.warn('Failed to load watchdog state, starting fresh', err);
      return {};
    }
  }

  private persist(): void {
    ensureStateDirectory(this.options.stateFile);
    fs.writeFileSync(
      this.options.stateFile,
      JSON.stringify(this.state, null, 2)
    );
  }

  private getOrCreate(agentId: string): AgentHealthStatus {
    if (!this.state[agentId]) {
      this.state[agentId] = {
        agentId,
        failures: 0,
      };
    }
    return this.state[agentId];
  }

  private isQuarantineActive(status: AgentHealthStatus): boolean {
    if (!status.quarantinedUntil) return false;
    const until = new Date(status.quarantinedUntil).getTime();
    if (Number.isNaN(until) || until <= Date.now()) {
      status.quarantinedUntil = null;
      return false;
    }
    return true;
  }

  recordSuccess(agentId: string): void {
    const status = this.getOrCreate(agentId);
    const wasQuarantined = this.isQuarantineActive(status);
    status.failures = 0;
    status.lastFailureReason = undefined;
    status.lastFailureAt = undefined;
    if (wasQuarantined) {
      status.quarantinedUntil = null;
      auditLog('watchdog.auto_release', {
        agentId,
        details: { reason: 'successful execution after quarantine' },
      });
    }
    this.persist();
  }

  recordFailure(agentId: string, reason?: string): void {
    const status = this.getOrCreate(agentId);
    status.failures += 1;
    status.lastFailureAt = this.now().toISOString();
    status.lastFailureReason = reason;
    const wasQuarantined = this.isQuarantineActive(status);
    if (status.failures >= this.options.failureThreshold) {
      const until = new Date(this.now().getTime() + this.options.quarantineMs);
      status.quarantinedUntil = until.toISOString();
      if (!wasQuarantined) {
        auditLog('watchdog.quarantine', {
          agentId,
          details: {
            failures: status.failures,
            until: status.quarantinedUntil,
            reason,
          },
        });
      }
    }
    this.persist();
  }

  isQuarantined(agentId: string): boolean {
    const status = this.state[agentId];
    if (!status) return false;
    const active = this.isQuarantineActive(status);
    if (!active && status.quarantinedUntil) {
      status.quarantinedUntil = null;
      this.persist();
    }
    return active;
  }

  manualReset(agentId: string): AgentHealthStatus {
    const status = this.getOrCreate(agentId);
    status.failures = 0;
    status.quarantinedUntil = null;
    status.lastResetAt = this.now().toISOString();
    this.persist();
    auditLog('watchdog.manual_reset', {
      agentId,
      details: { resetAt: status.lastResetAt },
    });
    return { ...status };
  }

  getStatus(agentId: string): AgentHealthStatus | null {
    const status = this.state[agentId];
    if (!status) return null;
    this.isQuarantined(agentId);
    return { ...status };
  }

  getQuarantined(): AgentHealthStatus[] {
    const results: AgentHealthStatus[] = [];
    for (const status of Object.values(this.state)) {
      if (this.isQuarantineActive(status)) {
        results.push({ ...status });
      }
    }
    return results;
  }

  listAll(): AgentHealthStatus[] {
    return Object.values(this.state).map((status) => ({ ...status }));
  }
}

let singleton: Watchdog | null = null;

export function getWatchdog(): Watchdog {
  if (!singleton) {
    singleton = new Watchdog();
  }
  return singleton;
}

function usage(): void {
  console.log('Watchdog commands:');
  console.log('  ts-node monitor.ts status [agentId]');
  console.log('  ts-node monitor.ts reset <agentId>');
  console.log('  ts-node monitor.ts quarantined');
}

function printStatus(statuses: AgentHealthStatus[]): void {
  console.log(JSON.stringify(statuses, null, 2));
}

if (require.main === module) {
  const [, , command, arg] = process.argv;
  const watchdog = getWatchdog();

  if (!command || command === 'help' || command === '--help') {
    usage();
    process.exit(0);
  }

  if (command === 'status') {
    if (arg) {
      const status = watchdog.getStatus(arg);
      printStatus(status ? [status] : []);
    } else {
      printStatus(watchdog.listAll());
    }
    process.exit(0);
  }

  if (command === 'reset') {
    if (!arg) {
      console.error('Agent id required for reset command');
      process.exit(1);
    }
    const status = watchdog.manualReset(arg);
    printStatus([status]);
    process.exit(0);
  }

  if (command === 'quarantined') {
    printStatus(watchdog.getQuarantined());
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  usage();
  process.exit(1);
}
