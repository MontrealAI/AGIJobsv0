import { strict as assert } from "node:assert";
import test from "node:test";

import { getSignerForUser } from "../src/chain/provider.js";

const relayerMnemonic = "test test test test test test test test test test test junk";
const aaMnemonic = "test walk nut penalty hip pave soap entry language right filter choice";

function snapshotEnv(keys: string[]) {
  return keys.map((key) => ({ key, value: process.env[key] }));
}

function restoreEnv(entries: { key: string; value: string | undefined }[]) {
  for (const { key, value } of entries) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("relayer mode reuses deterministic wallets per user", async () => {
  const backup = snapshotEnv([
    "TX_MODE",
    "RELAYER_PRIVATE_KEY",
    "RELAYER_MNEMONIC",
  ]);

  try {
    process.env.TX_MODE = "relayer";
    delete process.env.RELAYER_PRIVATE_KEY;
    process.env.RELAYER_MNEMONIC = relayerMnemonic;

    const aliceFirst = await getSignerForUser("alice");
    const aliceSecond = await getSignerForUser("alice");
    const bob = await getSignerForUser("bob");

    assert.equal(aliceFirst.address, aliceSecond.address);
    assert.notEqual(aliceFirst.address, bob.address);
  } finally {
    restoreEnv(backup);
  }
});

test("aa mode derives deterministic session keys per user", async () => {
  const backup = snapshotEnv([
    "TX_MODE",
    "AA_SESSION_PRIVATE_KEY",
    "AA_SESSION_MNEMONIC",
    "RELAYER_MNEMONIC",
  ]);

  try {
    process.env.TX_MODE = "aa";
    delete process.env.AA_SESSION_PRIVATE_KEY;
    process.env.AA_SESSION_MNEMONIC = aaMnemonic;
    delete process.env.RELAYER_MNEMONIC;

    const aliceFirst = await getSignerForUser("alice");
    const aliceSecond = await getSignerForUser("alice");
    const bob = await getSignerForUser("bob");

    assert.equal(aliceFirst.address, aliceSecond.address);
    assert.notEqual(aliceFirst.address, bob.address);
  } finally {
    restoreEnv(backup);
  }
});
