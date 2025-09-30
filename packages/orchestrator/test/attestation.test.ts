import { strict as assert } from "node:assert";
import test from "node:test";

import {
  decorateWithAttestation,
  setReceiptAttester,
  computeReceiptDigest,
  type ReceiptStage,
  type ReceiptAttester,
} from "../src/attestation/index.js";

type ReceiptAttestationRequest = {
  stage: ReceiptStage;
  payload: unknown;
  cid?: string | null;
  uri?: string | null;
  context?: Record<string, unknown>;
  recipient?: string;
};

type ReceiptAttestationResult = {
  uid: string;
  digest: string;
  txHash: string;
  cid?: string;
  uri?: string;
};

type AttesterLike = Pick<ReceiptAttester, "attest" | "verify" | "fetch">;

test("decorateWithAttestation returns digest when attester is disabled", async (t) => {
  t.after(() => setReceiptAttester(null));
  setReceiptAttester(null);

  const payload = { foo: "bar" };
  const decorated = await decorateWithAttestation("PLAN", { ...payload });

  assert.equal(decorated.receiptDigest, computeReceiptDigest(payload));
  assert.equal(decorated.receiptAttestationUid, undefined);
  assert.equal(decorated.receiptAttestationTxHash, undefined);
  assert.equal(decorated.receiptAttestationCid, undefined);
  assert.equal(decorated.receiptAttestationUri, undefined);
  assert.equal(decorated.foo, "bar");
});

test("decorateWithAttestation merges attestation metadata", async (t) => {
  const received: ReceiptAttestationRequest[] = [];
  const attester: AttesterLike = {
    attest: async (
      request: ReceiptAttestationRequest
    ): Promise<ReceiptAttestationResult> => {
      received.push(request);
      return {
        uid: "0xattest",
        digest: computeReceiptDigest(request.payload),
        txHash: "0xtxhash",
        cid: "attester-cid",
      };
    },
    verify: async () => true,
    fetch: async () => {
      throw new Error("not implemented");
    },
  };

  t.after(() => setReceiptAttester(null));
  setReceiptAttester(attester as ReceiptAttester);

  const payload = { jobId: "123", nested: { value: 1 } };
  const extras = {
    cid: "provided-cid",
    uri: "ipfs://provided",
    context: { agent: "runner" },
    recipient: "0x0000000000000000000000000000000000000001",
  };

  const decorated = await decorateWithAttestation(
    "SIMULATION",
    { ...payload },
    extras
  );

  assert.equal(decorated.receiptDigest, computeReceiptDigest(payload));
  assert.equal(decorated.receiptAttestationUid, "0xattest");
  assert.equal(decorated.receiptAttestationTxHash, "0xtxhash");
  assert.equal(decorated.receiptAttestationCid, "attester-cid");
  assert.equal(decorated.receiptAttestationUri, extras.uri);
  assert.equal(decorated.jobId, "123");

  assert.equal(received.length, 1);
  assert.deepEqual(received[0], {
    stage: "SIMULATION" satisfies ReceiptStage,
    payload: payload,
    cid: extras.cid,
    uri: extras.uri,
    context: extras.context,
    recipient: extras.recipient,
  });
});

test("decorateWithAttestation falls back to digest when attestation fails", async (t) => {
  const attester: AttesterLike = {
    attest: async () => {
      throw new Error("boom");
    },
    verify: async () => false,
    fetch: async () => {
      throw new Error("not implemented");
    },
  };

  t.after(() => setReceiptAttester(null));
  setReceiptAttester(attester as ReceiptAttester);

  const payload = { sample: true };
  const decorated = await decorateWithAttestation("EXECUTION", { ...payload });

  assert.equal(decorated.receiptDigest, computeReceiptDigest(payload));
  assert.equal(decorated.receiptAttestationUid, undefined);
  assert.equal(decorated.receiptAttestationTxHash, undefined);
  assert.equal(decorated.receiptAttestationCid, undefined);
  assert.equal(decorated.receiptAttestationUri, undefined);
});
