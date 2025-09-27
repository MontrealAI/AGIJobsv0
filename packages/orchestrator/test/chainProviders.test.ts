import { strict as assert } from "node:assert";
import test from "node:test";

import { getSignerForUser } from "../src/chain/provider.js";

const relayerMnemonic = "test test test test test test test test test test test junk";
const aaMnemonic = "test walk nut penalty hip pave soap entry language right filter choice";
const forwarderAddress = "0x0000000000000000000000000000000000000001";
const entryPointAddress = "0x0000000000000000000000000000000000000002";

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
    "RELAYER_USER_MNEMONIC",
    "RELAYER_SPONSOR_MNEMONIC",
    "EIP2771_TRUSTED_FORWARDER",
  ]);

  try {
    process.env.TX_MODE = "relayer";
    delete process.env.RELAYER_PRIVATE_KEY;
    process.env.RELAYER_MNEMONIC = relayerMnemonic;
    process.env.RELAYER_USER_MNEMONIC = relayerMnemonic;
    process.env.RELAYER_SPONSOR_MNEMONIC = relayerMnemonic;
    process.env.EIP2771_TRUSTED_FORWARDER = forwarderAddress;

    const aliceFirst = await getSignerForUser("alice");
    const aliceSecond = await getSignerForUser("alice");
    const bob = await getSignerForUser("bob");

    assert.equal(await aliceFirst.getAddress(), await aliceSecond.getAddress());
    assert.notEqual(await aliceFirst.getAddress(), await bob.getAddress());
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
    "AA_BUNDLER_RPC_URL",
    "AA_ENTRY_POINT",
  ]);

  try {
    process.env.TX_MODE = "aa";
    delete process.env.AA_SESSION_PRIVATE_KEY;
    process.env.AA_SESSION_MNEMONIC = aaMnemonic;
    delete process.env.RELAYER_MNEMONIC;
    process.env.AA_BUNDLER_RPC_URL = "http://127.0.0.1:4337";
    process.env.AA_ENTRY_POINT = entryPointAddress;

    const aliceFirst = await getSignerForUser("alice");
    const aliceSecond = await getSignerForUser("alice");
    const bob = await getSignerForUser("bob");

    assert.equal(await aliceFirst.getAddress(), await aliceSecond.getAddress());
    assert.notEqual(await aliceFirst.getAddress(), await bob.getAddress());
  } finally {
    restoreEnv(backup);
  }
});
