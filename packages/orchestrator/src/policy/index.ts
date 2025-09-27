import { ethers } from "ethers";

export interface PolicyContext {
  userId?: string;
  jobId?: string;
  traceId?: string;
  jobBudgetWei?: bigint;
}

export interface PolicyCharge {
  estimatedGas?: bigint;
  estimatedCostWei?: bigint;
}

type DailyUsage = {
  date: string;
  gasUsed: bigint;
};

type JobBudget = {
  total: bigint;
  spent: bigint;
};

type RateLimitWindow = number[];

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function toBigInt(value: bigint | number | string | undefined): bigint | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(Math.floor(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    if (/^0x[0-9a-fA-F]+$/u.test(trimmed)) {
      return BigInt(trimmed);
    }
    if (/^\d+$/u.test(trimmed)) {
      return BigInt(trimmed);
    }
    try {
      return BigInt(Math.floor(Number(trimmed)));
    } catch (error) {
      console.warn("Failed to parse bigint from", value, error);
      return undefined;
    }
  }
  return undefined;
}

function parseDailyGasLimit(): bigint | null {
  const configured = process.env.POLICY_DAILY_GAS_CAP;
  if (!configured) {
    return null;
  }
  const parsed = toBigInt(configured);
  return parsed ?? null;
}

function parseJobBudgetLimit(): bigint | null {
  const configured = process.env.POLICY_MAX_JOB_BUDGET_AGIA;
  if (!configured) {
    return null;
  }
  try {
    return ethers.parseUnits(configured, 18);
  } catch (error) {
    console.warn("Failed to parse POLICY_MAX_JOB_BUDGET_AGIA", error);
    return null;
  }
}

function parseRateLimitWindow(): { windowMs: number; maxRequests: number } | null {
  const windowMsRaw = process.env.POLICY_RATE_LIMIT_WINDOW_MS;
  const maxRequestsRaw = process.env.POLICY_RATE_LIMIT_MAX_REQUESTS;
  if (!windowMsRaw || !maxRequestsRaw) {
    return null;
  }
  const windowMs = Number(windowMsRaw);
  const maxRequests = Number(maxRequestsRaw);
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    console.warn("Invalid POLICY_RATE_LIMIT_WINDOW_MS", windowMsRaw);
    return null;
  }
  if (!Number.isFinite(maxRequests) || maxRequests <= 0) {
    console.warn("Invalid POLICY_RATE_LIMIT_MAX_REQUESTS", maxRequestsRaw);
    return null;
  }
  return { windowMs, maxRequests };
}

class PolicyManager {
  private readonly dailyGasLimit = parseDailyGasLimit();

  private readonly maxJobBudget = parseJobBudgetLimit();

  private readonly rateLimitConfig = parseRateLimitWindow();

  private readonly dailyUsage = new Map<string, DailyUsage>();

  private readonly jobBudgets = new Map<string, JobBudget>();

  private readonly rateLimiter = new Map<string, RateLimitWindow>();

  validateJobCreationBudget(amountWei: bigint): void {
    if (!this.maxJobBudget) {
      return;
    }
    if (amountWei > this.maxJobBudget) {
      throw new Error(
        `Job budget ${ethers.formatEther(amountWei)} exceeds maximum of ${ethers.formatEther(this.maxJobBudget)} AGIA`
      );
    }
  }

  registerJobBudget(jobId: string, totalBudgetWei: bigint): void {
    if (!jobId) {
      return;
    }
    const entry = this.jobBudgets.get(jobId);
    if (entry) {
      entry.total = totalBudgetWei;
      return;
    }
    this.jobBudgets.set(jobId, { total: totalBudgetWei, spent: 0n });
  }

  private getDailyUsage(userId: string): DailyUsage {
    const today = todayUTC();
    const existing = this.dailyUsage.get(userId);
    if (existing && existing.date === today) {
      return existing;
    }
    const fresh: DailyUsage = { date: today, gasUsed: 0n };
    this.dailyUsage.set(userId, fresh);
    return fresh;
  }

  private checkRateLimit(userId: string): void {
    if (!this.rateLimitConfig || !userId) {
      return;
    }
    const now = Date.now();
    const { windowMs, maxRequests } = this.rateLimitConfig;
    const window = this.rateLimiter.get(userId) ?? [];
    const cutoff = now - windowMs;
    const filtered = window.filter((ts) => ts >= cutoff);
    if (filtered.length >= maxRequests) {
      throw new Error("Rate limit exceeded for user");
    }
    filtered.push(now);
    this.rateLimiter.set(userId, filtered);
  }

  private ensureDailyGasBudget(userId: string, gas: bigint | undefined): void {
    if (!this.dailyGasLimit || !userId || gas === undefined) {
      return;
    }
    const usage = this.getDailyUsage(userId);
    if (usage.gasUsed + gas > this.dailyGasLimit) {
      throw new Error("Daily gas cap exceeded for user");
    }
  }

  private ensureJobBudget(jobId: string | undefined, costWei: bigint | undefined): void {
    if (!jobId || costWei === undefined) {
      return;
    }
    const budget = this.jobBudgets.get(jobId);
    if (!budget) {
      return;
    }
    if (budget.spent + costWei > budget.total) {
      throw new Error("Job budget exhausted");
    }
  }

  ensureWithinLimits(context: PolicyContext, charge: PolicyCharge): void {
    const { userId, jobId } = context;
    this.checkRateLimit(userId ?? "");
    this.ensureDailyGasBudget(userId ?? "", charge.estimatedGas);
    this.ensureJobBudget(jobId, charge.estimatedCostWei);
  }

  recordUsage(context: PolicyContext, charge: PolicyCharge): void {
    const { userId, jobId } = context;
    if (userId && charge.estimatedGas !== undefined) {
      const usage = this.getDailyUsage(userId);
      usage.gasUsed += charge.estimatedGas;
    }
    if (jobId && charge.estimatedCostWei !== undefined) {
      const budget = this.jobBudgets.get(jobId);
      if (budget) {
        budget.spent += charge.estimatedCostWei;
      }
    }
  }
}

let singleton: PolicyManager | null = null;

function getOrCreateSingleton(): PolicyManager {
  if (!singleton) {
    singleton = new PolicyManager();
  }
  return singleton;
}

export function policyManager(): PolicyManager {
  return getOrCreateSingleton();
}

export function __resetPolicyForTests(): void {
  singleton = null;
}

export function extractPolicyContext(value: unknown): PolicyContext {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  const context: PolicyContext = {};
  if (typeof record.userId === "string" && record.userId.trim()) {
    context.userId = record.userId.trim();
  }
  if (typeof record.jobId === "string" && record.jobId.trim()) {
    context.jobId = record.jobId.trim();
  }
  if (typeof record.traceId === "string" && record.traceId.trim()) {
    context.traceId = record.traceId.trim();
  }
  const budget = toBigInt(record.jobBudgetWei as string | number | bigint | undefined);
  if (budget !== undefined) {
    context.jobBudgetWei = budget;
  }
  return context;
}

