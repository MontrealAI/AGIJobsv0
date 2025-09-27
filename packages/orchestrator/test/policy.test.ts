import { strict as assert } from "node:assert";
import test from "node:test";

import { ethers } from "ethers";

import {
  policyManager,
  __resetPolicyForTests,
  type PolicyCharge,
  type PolicyContext,
} from "../src/policy/index.js";

const POLICY_ENV_KEYS = [
  "POLICY_DAILY_GAS_CAP",
  "POLICY_MAX_JOB_BUDGET_AGIA",
  "POLICY_RATE_LIMIT_WINDOW_MS",
  "POLICY_RATE_LIMIT_MAX_REQUESTS",
] as const;

type PolicyEnvKey = (typeof POLICY_ENV_KEYS)[number];

type EnvSnapshot = Array<{ key: PolicyEnvKey; value: string | undefined }>;

type EnvOverrides = Partial<Record<PolicyEnvKey, string | undefined>>;

function snapshotEnv(): EnvSnapshot {
  return POLICY_ENV_KEYS.map((key) => ({ key, value: process.env[key] }));
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const { key, value } of snapshot) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function applyPolicyEnv(overrides: EnvOverrides): void {
  for (const key of POLICY_ENV_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides) as Array<[
    PolicyEnvKey,
    string | undefined,
  ]>) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function withPolicyEnv<T>(
  overrides: EnvOverrides,
  fn: () => Promise<T> | T
): Promise<T> {
  const snapshot = snapshotEnv();
  try {
    applyPolicyEnv(overrides);
    __resetPolicyForTests();
    return await fn();
  } finally {
    restoreEnv(snapshot);
    __resetPolicyForTests();
  }
}

test("policy enforces per-user daily gas caps", async () => {
  await withPolicyEnv({
    POLICY_DAILY_GAS_CAP: "100000",
  }, () => {
    const policy = policyManager();
    const context: PolicyContext = { userId: "daily-user" };
    const firstCharge: PolicyCharge = { estimatedGas: 60_000n };
    policy.ensureWithinLimits(context, firstCharge);
    policy.recordUsage(context, firstCharge);

    const overflow: PolicyCharge = { estimatedGas: 50_000n };
    assert.throws(
      () => policy.ensureWithinLimits(context, overflow),
      /Daily gas cap exceeded/
    );
  });
});

test("policy enforces job budget ceilings", async () => {
  await withPolicyEnv({
    POLICY_MAX_JOB_BUDGET_AGIA: "100",
  }, () => {
    const policy = policyManager();
    const withinLimit = ethers.parseUnits("10", 18);
    const beyondLimit = ethers.parseUnits("101", 18);

    policy.validateJobCreationBudget(withinLimit);
    assert.throws(() => policy.validateJobCreationBudget(beyondLimit));

    const jobId = "job-123";
    const totalBudget = ethers.parseUnits("10", 18);
    policy.registerJobBudget(jobId, totalBudget);

    const firstCharge: PolicyCharge = {
      estimatedCostWei: ethers.parseUnits("6", 18),
    };
    const context: PolicyContext = { jobId };
    policy.ensureWithinLimits(context, firstCharge);
    policy.recordUsage(context, firstCharge);

    const overflow: PolicyCharge = {
      estimatedCostWei: ethers.parseUnits("5", 18),
    };
    assert.throws(
      () => policy.ensureWithinLimits(context, overflow),
      /Job budget exhausted/
    );
  });
});

test("policy applies per-user rate limits", async () => {
  await withPolicyEnv({
    POLICY_RATE_LIMIT_WINDOW_MS: "60000",
    POLICY_RATE_LIMIT_MAX_REQUESTS: "2",
  }, () => {
    const policy = policyManager();
    const context: PolicyContext = { userId: "rate-user" };

    policy.ensureWithinLimits(context, {});
    policy.recordUsage(context, {});

    policy.ensureWithinLimits(context, {});
    policy.recordUsage(context, {});

    assert.throws(
      () => policy.ensureWithinLimits(context, {}),
      /Rate limit exceeded/
    );
  });
});
