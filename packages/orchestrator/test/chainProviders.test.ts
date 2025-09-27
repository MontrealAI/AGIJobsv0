import { strict as assert } from "node:assert";
import test from "node:test";

import { ethers } from "ethers";

import { getSignerForUser } from "../src/chain/provider.js";
import {
  AccountAbstractionSigner,
  type AccountAbstractionConfig,
} from "../src/chain/providers/aa.js";
import type { ManagedPaymasterClient } from "../src/chain/providers/paymaster.js";

const relayerMnemonic = "test test test test test test test test test test test junk";
const aaMnemonic = "test walk nut penalty hip pave soap entry language right filter choice";
const forwarderAddress = "0x0000000000000000000000000000000000000001";
const entryPointAddress = "0x0000000000000000000000000000000000000002";

function snapshotEnv(keys: string[]) {
  return keys.map((key) => ({ key, value: process.env[key] }));
}

function randomWallet(): ethers.Wallet {
  const wallet = ethers.Wallet.createRandom();
  return new ethers.Wallet(wallet.privateKey);
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

test("aa signer falls back to bundler gas estimates for undeployed accounts", async () => {
  const wallet = randomWallet();
  const config: AccountAbstractionConfig = {
    entryPoint: entryPointAddress,
    bundlerUrl: "http://127.0.0.1:4337",
    bundlerHeaders: {},
    accountSalt: 0n,
    verificationGasLimit: 1_500_000n,
    preVerificationGas: 60_000n,
    callGasBuffer: 25_000n,
  };

  const signer = new AccountAbstractionSigner(wallet, config);

  let bundlerCalled = false;
  const bundlerEstimates = {
    callGasLimit: 100_000n,
    preVerificationGas: 70_000n,
    verificationGasLimit: 120_000n,
  };

  const bundlerClient = (signer as any).bundler;
  bundlerClient.estimateUserOperationGas = async () => {
    bundlerCalled = true;
    return bundlerEstimates;
  };

  (signer as any).resolveInitCode = async () => "0x1234";
  (signer as any).resolveNonce = async () => 0n;

  const tx: ethers.TransactionRequest = {
    to: wallet.address,
    data: "0x",
  };

  const result = await (signer as any).buildUserOperation(tx);
  const userOp = result.userOp;

  assert.equal(bundlerCalled, true);
  assert.equal(userOp.callGasLimit, bundlerEstimates.callGasLimit + config.callGasBuffer);
  assert.equal(userOp.preVerificationGas, bundlerEstimates.preVerificationGas);
  assert.equal(userOp.verificationGasLimit, bundlerEstimates.verificationGasLimit);
  assert.notEqual(userOp.callGasLimit, config.callGasBuffer);
});

test("aa signer forwards policy context to managed paymaster", async () => {
  const wallet = randomWallet();
  const staticContext = { sponsor: "static", jobId: "static-job" };
  const paymasterCalls: Array<{ context?: Record<string, unknown> }> = [];

  const paymaster = {
    sponsorUserOperation: async (params: {
      context?: Record<string, unknown>;
    }) => {
      paymasterCalls.push({ context: params.context });
      return { paymasterAndData: "0x" };
    },
  } as unknown as ManagedPaymasterClient;

  const config: AccountAbstractionConfig = {
    entryPoint: entryPointAddress,
    bundlerUrl: "http://127.0.0.1:4337",
    bundlerHeaders: {},
    accountSalt: 0n,
    verificationGasLimit: 1_500_000n,
    preVerificationGas: 60_000n,
    callGasBuffer: 25_000n,
    paymaster,
    paymasterContext: staticContext,
  };

  const signer = new AccountAbstractionSigner(wallet, config);

  (signer as any).resolveInitCode = async () => "0x";
  (signer as any).resolveNonce = async () => 0n;
  (signer as any).ensureChainId = async () => 1n;
  (signer as any).resolveFeeData = async () => ({ maxFee: 1n, maxPriority: 1n });
  (signer as any).estimateCallGas = async () => ({
    callGasLimit: 1000n,
    preVerificationGas: config.preVerificationGas,
    verificationGasLimit: config.verificationGasLimit,
  });

  const policyContext = {
    userId: "user-1",
    jobId: "job-42",
    traceId: "trace-abc",
    jobBudgetWei: 1234n,
  };

  const tx: ethers.TransactionRequest = {
    to: wallet.address,
    gasLimit: 1000n,
  };

  await (signer as any).buildUserOperation(tx, policyContext);

  assert.equal(paymasterCalls.length, 1);
  const context = paymasterCalls[0].context ?? {};
  assert.equal(context.userId, policyContext.userId);
  assert.equal(context.jobId, policyContext.jobId);
  assert.equal(context.traceId, policyContext.traceId);
  assert.equal(context.jobBudgetWei, policyContext.jobBudgetWei.toString());
  assert.equal(context.sponsor, staticContext.sponsor);
});
