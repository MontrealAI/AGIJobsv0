import { promises as fs } from 'fs';
import path from 'path';
import { JsonRpcProvider, Wallet, ethers } from 'ethers';
import { getAuditLogDirectory } from './audit';

interface AnchorRecord {
  root: string;
  txHash: string;
  anchoredAt: string;
  entries: number;
  fileSize: number;
}

interface AnchorState {
  anchored: Record<string, AnchorRecord>;
}

export interface AuditAnchoringOptions {
  provider: JsonRpcProvider;
  wallet: Wallet;
  anchorAddress?: string;
  intervalMs?: number;
  minFileAgeMs?: number;
  stateFile?: string;
  maxFilesPerRun?: number;
}

const DEFAULT_INTERVAL_MS = Number(
  process.env.AUDIT_ANCHOR_INTERVAL_MS || 6 * 60 * 60 * 1000
);
const DEFAULT_MIN_FILE_AGE_MS = Number(
  process.env.AUDIT_ANCHOR_MIN_FILE_AGE_MS || 15 * 60 * 1000
);
const DEFAULT_MAX_FILES_PER_RUN = Number(
  process.env.AUDIT_ANCHOR_MAX_FILES || 4
);
const DEFAULT_STATE_FILE = path.resolve(
  __dirname,
  '../../storage/audit-anchor-state.json'
);
const ANCHOR_PREFIX = ethers.toUtf8Bytes('AGIA');

async function ensureDirectory(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

export class AuditAnchoringService {
  private readonly provider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly anchorAddress: string;
  private readonly intervalMs: number;
  private readonly minFileAgeMs: number;
  private readonly stateFile: string;
  private readonly maxFilesPerRun: number;
  private readonly logDir: string;
  private timer: NodeJS.Timeout | null = null;
  private state: AnchorState = { anchored: {} };
  private running = false;
  private queued = false;

  constructor(options: AuditAnchoringOptions) {
    this.provider = options.provider;
    this.wallet = options.wallet.connect(this.provider);
    this.anchorAddress = options.anchorAddress
      ? ethers.getAddress(options.anchorAddress)
      : this.wallet.address;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.minFileAgeMs = options.minFileAgeMs ?? DEFAULT_MIN_FILE_AGE_MS;
    this.stateFile = options.stateFile
      ? path.resolve(options.stateFile)
      : DEFAULT_STATE_FILE;
    this.maxFilesPerRun = options.maxFilesPerRun ?? DEFAULT_MAX_FILES_PER_RUN;
    this.logDir = getAuditLogDirectory();
  }

  async initialize(): Promise<void> {
    this.state = await this.loadState();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.anchorPending().catch((err) =>
        console.error('audit-anchor interval error', err)
      );
    }, this.intervalMs);
    void this.anchorPending();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async trigger(): Promise<void> {
    this.queued = true;
    await this.anchorPending();
  }

  private async anchorPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      do {
        this.queued = false;
        const files = await this.listEligibleLogFiles();
        if (!files.length) {
          continue;
        }
        for (const file of files.slice(0, this.maxFilesPerRun)) {
          try {
            const record = await this.anchorFile(file);
            if (record) {
              const name = path.basename(file);
              this.state.anchored[name] = record;
              await this.saveState();
            }
          } catch (err) {
            console.error('Failed to anchor audit log', file, err);
          }
        }
      } while (this.queued);
    } finally {
      this.running = false;
    }
  }

  private async loadState(): Promise<AnchorState> {
    try {
      const raw = await fs.readFile(this.stateFile, 'utf8');
      if (!raw.trim()) {
        return { anchored: {} };
      }
      const parsed = JSON.parse(raw) as AnchorState;
      return { anchored: parsed.anchored ?? {} };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        await ensureDirectory(path.dirname(this.stateFile));
        return { anchored: {} };
      }
      throw err;
    }
  }

  private async saveState(): Promise<void> {
    await ensureDirectory(path.dirname(this.stateFile));
    await fs.writeFile(
      this.stateFile,
      JSON.stringify(this.state, null, 2),
      'utf8'
    );
  }

  private async listEligibleLogFiles(): Promise<string[]> {
    const entries = await fs.readdir(this.logDir, { withFileTypes: true });
    const today = new Date().toISOString().slice(0, 10) + '.log';
    const now = Date.now();
    const files: string[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.log')) continue;
      if (entry.name === today) continue;
      if (this.state.anchored[entry.name]) continue;
      const fullPath = path.join(this.logDir, entry.name);
      try {
        const stats = await fs.stat(fullPath);
        if (now - stats.mtimeMs < this.minFileAgeMs) continue;
        files.push(fullPath);
      } catch (err) {
        console.warn('Skipping audit log due to stat failure', fullPath, err);
      }
    }
    files.sort();
    return files;
  }

  private async anchorFile(filePath: string): Promise<AnchorRecord | null> {
    const { root, leaves } = await this.computeRoot(filePath);
    if (!leaves.length) {
      return null;
    }
    const payload = ethers.hexlify(
      ethers.concat([ANCHOR_PREFIX, ethers.getBytes(root)])
    );
    const tx = await this.wallet.sendTransaction({
      to: this.anchorAddress,
      data: payload,
      value: 0n,
    });
    await tx.wait();
    const stats = await fs.stat(filePath);
    console.log(
      `Anchored audit log ${path.basename(filePath)} as ${tx.hash}`
    );
    return {
      root,
      txHash: tx.hash,
      anchoredAt: new Date().toISOString(),
      entries: leaves.length,
      fileSize: stats.size,
    };
  }

  private async computeRoot(
    filePath: string
  ): Promise<{ root: string; leaves: string[] }> {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (!lines.length) {
      return { root: ethers.ZeroHash, leaves: [] };
    }
    const leaves = lines.map((line) =>
      ethers.keccak256(ethers.toUtf8Bytes(line))
    );
    let level = [...leaves];
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] ?? level[i];
        next.push(
          ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [left, right]
          )
        );
      }
      level = next;
    }
    return { root: level[0], leaves };
  }
}
