import { strict as assert } from "node:assert";
import test from "node:test";

import { planAndExecute } from "../src/llm.js";

test("create_job confirmation routes with user meta", async () => {
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
});
