import { strict as assert } from "node:assert";
import test from "node:test";

import type { Contract } from "ethers";

import { __test__ } from "../src/tools/dispute.js";

const { callRaiseDispute } = __test__;

type RegistryCall = { method: string; args: unknown[] };

type CallSpy = ((...args: unknown[]) => Promise<unknown>) & {
  populateTransaction?: (...args: unknown[]) => Promise<unknown>;
};

type RegistryStub = Record<string, CallSpy>;

function createStub() {
  const calls: RegistryCall[] = [];
  const build = (label: string): CallSpy => {
    const fn: CallSpy = (...args: unknown[]) => {
      calls.push({ method: label, args });
      return Promise.resolve({ hash: `${label}-hash` });
    };
    fn.populateTransaction = (...args: unknown[]) => {
      calls.push({ method: `${label}:populate`, args });
      return Promise.resolve({ to: "0x0", data: "0x", value: 0n });
    };
    return fn;
  };

  const registry: RegistryStub = {
    dispute: build("dispute"),
    "raiseDispute(uint256,bytes32)": build("bytes32"),
    "raiseDispute(uint256,string)": build("string"),
  };

  return { registry, calls };
}

test("callRaiseDispute uses bytes32 overload during populate", async () => {
  const { registry, calls } = createStub();
  const overrides = { customData: { policy: { jobId: "8" } } };
  const hash = "0x" + "aa".repeat(32);

  await callRaiseDispute(
    registry as unknown as Contract,
    { jobId: 8n, evidenceHash: hash },
    overrides,
    "populate"
  );

  assert.equal(calls[0]?.method, "bytes32:populate");
  assert.equal(calls[0]?.args[0], 8n);
  assert.equal(calls[0]?.args[1], hash);
  assert.deepEqual(calls[0]?.args[2], overrides);
});

test("callRaiseDispute sends dispute for combined evidence", async () => {
  const { registry, calls } = createStub();
  const overrides = { customData: { policy: { jobId: "9" } } };
  const hash = "0x" + "bb".repeat(32);
  const reason = "ipfs://evidence/9";

  await callRaiseDispute(
    registry as unknown as Contract,
    { jobId: 9n, evidenceHash: hash, reason },
    overrides,
    "execute"
  );

  assert.equal(calls[0]?.method, "dispute");
  assert.equal(calls[0]?.args[0], 9n);
  assert.equal(calls[0]?.args[1], hash);
  assert.equal(calls[0]?.args[2], reason);
  assert.deepEqual(calls[0]?.args[3], overrides);
});

test("callRaiseDispute uses string overload when only a reason is provided", async () => {
  const { registry, calls } = createStub();
  await callRaiseDispute(
    registry as unknown as Contract,
    { jobId: 10n, reason: "ipfs://only-reason" },
    undefined,
    "execute"
  );

  assert.equal(calls[0]?.method, "string");
  assert.equal(calls[0]?.args[0], 10n);
  assert.equal(calls[0]?.args[1], "ipfs://only-reason");
});
