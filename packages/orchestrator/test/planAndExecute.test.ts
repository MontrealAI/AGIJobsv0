import { strict as assert } from "node:assert";
import test from "node:test";
import { ethers } from "ethers";

import { planAndExecute } from "../src/llm.js";
import {
  __setGetSignerForUser,
  __setLoadContracts,
} from "../src/chain/deps.js";

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

test("validate intent commits and reveals vote", async (t) => {
  const userId = "validator-001";
  const message = "Please validate job #77 as approved with validator.agijobs.eth.";

  const nonce = 5n;
  const specHash = "0x" + "11".repeat(32);
  const domain = "0x" + "22".repeat(32);
  const chainId = 31337n;
  const validator = "0x1111111111111111111111111111111111111111";
  const commitTxHash = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
  const revealTxHash = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

  const commitCalls: unknown[][] = [];
  const revealCalls: unknown[][] = [];

  t.after(() => {
    __setLoadContracts(null);
    __setGetSignerForUser(null);
  });

  __setLoadContracts(() =>
    ({
      erc20: {} as unknown,
      stakeManager: {} as unknown,
      jobRegistry: {
        getSpecHash: async () => specHash,
      } as unknown,
      validationModule: {
        jobNonce: async () => nonce,
        DOMAIN_SEPARATOR: async () => domain,
        commitValidation: async (...args: unknown[]) => {
          commitCalls.push(args);
          return { hash: commitTxHash, wait: async () => ({}) };
        },
        revealValidation: async (...args: unknown[]) => {
          revealCalls.push(args);
          return { hash: revealTxHash, wait: async () => ({}) };
        },
      } as unknown,
      disputeModule: {} as unknown,
    }) as any
  );

  __setGetSignerForUser(async () =>
    ({
      address: validator,
      getAddress: async () => validator,
      provider: {
        getNetwork: async () => ({ chainId, name: "anvil" }),
      },
    }) as any
  );

  const chunks: string[] = [];
  for await (const chunk of planAndExecute({ message, meta: { userId } })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.includes("🗳️ Committing validation vote…\n"));
  assert.ok(chunks.includes("🔓 Revealing validation vote…\n"));
  assert.ok(chunks.includes("✅ Validation recorded for job #77.\n"));

  assert.equal(commitCalls.length, 1);
  assert.equal(revealCalls.length, 1);

  const [commitJobId, commitHash, commitSubdomain, commitProof] = commitCalls[0];
  assert.equal(commitJobId, 77n);
  assert.equal(commitSubdomain, "validator");
  assert.deepEqual(commitProof, []);

  const [revealJobId, approve, burnTxHash, salt, subdomain, proof] = revealCalls[0];
  assert.equal(revealJobId, 77n);
  assert.equal(approve, true);
  assert.equal(burnTxHash, ethers.ZeroHash);
  assert.equal(subdomain, "validator");
  assert.deepEqual(proof, []);

  const expectedSalt = ethers.keccak256(ethers.toUtf8Bytes("orchestrator-salt"));
  assert.equal(salt, expectedSalt);

  const outcomeHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "bytes32", "bool", "bytes32"],
      [nonce, specHash, true, ethers.ZeroHash]
    )
  );
  const expectedCommitHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "bytes32", "bytes32", "address", "uint256", "bytes32"],
      [77n, outcomeHash, expectedSalt, validator, chainId, domain]
    )
  );
  assert.equal(commitHash, expectedCommitHash);
});

test("dispute intent packages evidence and raises", async (t) => {
  const userId = "disputer-002";
  const message = "I need to dispute job #88 due to incorrect output.";

  const disputeCalls: unknown[][] = [];
  const disputeTxHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  t.after(() => {
    __setLoadContracts(null);
    __setGetSignerForUser(null);
  });

  __setLoadContracts(() =>
    ({
      erc20: {} as unknown,
      stakeManager: {} as unknown,
      jobRegistry: {} as unknown,
      validationModule: {} as unknown,
      disputeModule: {
        raiseDispute: async (...args: unknown[]) => {
          disputeCalls.push(args);
          return { hash: disputeTxHash, wait: async () => ({}) };
        },
      } as unknown,
    }) as any
  );

  __setGetSignerForUser(async () =>
    ({
      address: "0x2222222222222222222222222222222222222222",
      getAddress: async () => "0x2222222222222222222222222222222222222222",
      provider: {
        getNetwork: async () => ({ chainId: 1n, name: "mainnet" }),
      },
    }) as any
  );

  const outputs: string[] = [];
  for await (const chunk of planAndExecute({ message, meta: { userId } })) {
    outputs.push(chunk);
  }

  assert.ok(outputs.includes("📦 Packaging dispute evidence…\n"));
  assert.ok(outputs.some((line) => line.startsWith("📨 Evidence pinned:")));
  assert.ok(outputs.includes("⚖️ Raising dispute…\n"));
  assert.ok(outputs.includes("✅ Dispute submitted for job #88.\n"));

  assert.equal(disputeCalls.length, 1);
  const [jobId, reasonUri] = disputeCalls[0];
  assert.equal(jobId, 88n);

  const payload = {
    reason: { summary: message },
    evidence: { note: "auto-generated" },
  } as const;
  const digest = ethers.id(JSON.stringify(payload)).slice(2, 10);
  const expectedUri = `ipfs://stub-${digest}`;
  assert.equal(reasonUri, expectedUri);
});
