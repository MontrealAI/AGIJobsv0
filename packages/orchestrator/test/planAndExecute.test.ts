import { strict as assert } from "node:assert";
import test from "node:test";

import { planAndExecute } from "../src/llm.js";

test("create_job confirmation routes with user meta", async () => {
  const previousEnv = {
    RELAYER_USER_MNEMONIC: process.env.RELAYER_USER_MNEMONIC,
    RELAYER_SPONSOR_MNEMONIC: process.env.RELAYER_SPONSOR_MNEMONIC,
    RELAYER_MNEMONIC: process.env.RELAYER_MNEMONIC,
    EIP2771_TRUSTED_FORWARDER: process.env.EIP2771_TRUSTED_FORWARDER,
  };
  const mnemonic =
    process.env.RELAYER_MNEMONIC ??
    process.env.RELAYER_USER_MNEMONIC ??
    "test test test test test test test test test test test junk";
  const forwarder = process.env.EIP2771_TRUSTED_FORWARDER ??
    "0x0000000000000000000000000000000000000001";
  process.env.RELAYER_MNEMONIC = mnemonic;
  process.env.RELAYER_USER_MNEMONIC = mnemonic;
  process.env.RELAYER_SPONSOR_MNEMONIC = mnemonic;
  process.env.EIP2771_TRUSTED_FORWARDER = forwarder;

  const userId = "session-test-123";
  const message =
    "Create a job to label 500 images, paying 500 AGIA, deadline in 7 days with a detailed spec.";

  const history: { role: string; text: string; meta?: Record<string, unknown> }[] = [];

  let firstResponse = "";
  for await (const chunk of planAndExecute({ message, history, meta: { userId } })) {
    firstResponse += chunk;
  }

  assert.match(firstResponse, /trace:/, "confirmation response includes trace id");

  history.push({ role: "user", text: message, meta: { userId } });
  history.push({ role: "assistant", text: firstResponse, meta: { userId } });

  const iterator = planAndExecute({ message: "yes", history, meta: { userId } });

  const planning = await iterator.next();
  assert.equal(planning.value, "🤖 Planning…\n");

  const confirmation = await iterator.next();
  assert.ok(confirmation.value?.includes("Confirmation received"));

  const jobStep = await iterator.next();
  assert.ok(jobStep.value?.includes("📦 Packaging job spec"));
  assert.ok(!jobStep.value?.includes("Missing meta.userId"));

  await iterator.return?.();

  process.env.RELAYER_USER_MNEMONIC = previousEnv.RELAYER_USER_MNEMONIC;
  process.env.RELAYER_SPONSOR_MNEMONIC = previousEnv.RELAYER_SPONSOR_MNEMONIC;
  process.env.RELAYER_MNEMONIC = previousEnv.RELAYER_MNEMONIC;
  process.env.EIP2771_TRUSTED_FORWARDER = previousEnv.EIP2771_TRUSTED_FORWARDER;
});
