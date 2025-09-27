import { strict as assert } from "node:assert";
import test from "node:test";

import { streamLLM } from "../src/providers/openai.js";
import { validateICS } from "../src/ics.js";

const meta = {
  traceId: "11111111-2222-4333-8444-555555555555",
  userId: "user-123",
  txMode: "aa" as const,
};

test("create_job prompt yields valid ICS", async () => {
  const prompt = [
    { role: "system", content: "system" },
    {
      role: "user",
      content:
        "Create a job for a marketing plan paying 500 AGIA, deadline in 14 days, include market analysis and outreach steps.",
    },
  ];

  const icsText = await streamLLM(prompt, { expect: "json", meta });
  const ics = validateICS(icsText);

  assert.equal(ics.intent, "create_job");
  assert.equal(ics.params.job.rewardAGIA, "500");
  assert.equal(ics.params.job.deadline, 14);
  assert.equal(ics.meta?.traceId, meta.traceId);
  assert.equal(ics.meta?.userId, meta.userId);
  assert.equal(ics.meta?.txMode, meta.txMode);
  assert.ok(ics.params.job.spec);
});

test("apply_job prompt yields valid ICS", async () => {
  const prompt = [
    {
      role: "user",
      content: "I want to apply to job #42 using alice.agijobs.eth as my ENS.",
    },
  ];

  const icsText = await streamLLM(prompt, { expect: "json", meta });
  const ics = validateICS(icsText);

  assert.equal(ics.intent, "apply_job");
  assert.equal(ics.params.jobId, 42);
  assert.equal(ics.params.ens.subdomain, "alice");
  assert.equal(ics.meta?.traceId, meta.traceId);
  assert.equal(ics.meta?.txMode, meta.txMode);
});

test("submit_work prompt yields valid ICS", async () => {
  const prompt = [
    {
      role: "user",
      content:
        "Submit work for job 87 with final files, referencing report link and signed by bob.agijobs.eth.",
    },
  ];

  const icsText = await streamLLM(prompt, { expect: "json", meta });
  const ics = validateICS(icsText);

  assert.equal(ics.intent, "submit_work");
  assert.equal(ics.params.jobId, 87);
  assert.equal(ics.params.ens.subdomain, "bob");
  assert.ok(ics.params.result.payload);
  assert.equal(ics.meta?.txMode, meta.txMode);
});

test("finalize prompt yields valid ICS", async () => {
  const prompt = [
    {
      role: "user",
      content: "Finalize job 73 as successful completion, release payment.",
    },
  ];

  const icsText = await streamLLM(prompt, { expect: "json", meta });
  const ics = validateICS(icsText);

  assert.equal(ics.intent, "finalize");
  assert.equal(ics.params.jobId, 73);
  assert.equal(ics.params.success, true);
  assert.equal(ics.meta?.txMode, meta.txMode);
});
