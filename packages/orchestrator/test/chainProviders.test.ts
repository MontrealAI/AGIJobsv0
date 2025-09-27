import { strict as assert } from "node:assert";
import test from "node:test";

import { ethers } from "ethers";

import { getSignerForUser } from "../src/chain/provider.js";
import {
  AccountAbstractionSigner,
  type AccountAbstractionConfig,
} from "../src/chain/providers/aa.js";
import {
  MetaTxSigner,
  __resetForwarderConfigForTests,
} from "../src/chain/providers/metaTx.js";
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

class MockProvider extends ethers.AbstractProvider {
  public readonly estimateGasCalls: ethers.TransactionRequest[] = [];

  private readonly estimateResults: Array<{ result?: bigint; error?: Error }> = [];

  private readonly feeDataResult: ethers.FeeData;

  constructor() {
    super({ name: "mock", chainId: 1 });
    this.feeDataResult = {
      gasPrice: ethers.parseUnits("20", "gwei"),
      maxFeePerGas: ethers.parseUnits("20", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
      toJSON: () => ({
        gasPrice: "0x0",
        maxFeePerGas: "0x0",
        maxPriorityFeePerGas: "0x0",
      }),
    } as ethers.FeeData;
  }

  queueEstimateGas(value: bigint | Error): void {
    if (value instanceof Error) {
      this.estimateResults.push({ error: value });
    } else {
      this.estimateResults.push({ result: value });
    }
  }

  async estimateGas(tx: ethers.TransactionRequest): Promise<bigint> {
    this.estimateGasCalls.push(tx);
    const next = this.estimateResults.shift();
    if (!next) {
      return 100_000n;
    }
    if (next.error) {
      throw next.error;
    }
    return next.result ?? 100_000n;
  }

  async getFeeData(): Promise<ethers.FeeData> {
    return this.feeDataResult;
  }

  async _detectNetwork(): Promise<ethers.Network> {
    return new ethers.Network("mock", 1);
  }

  // The tests only rely on the explicit overrides above.
  async _perform(): Promise<never> {
    throw new Error("MockProvider does not support direct RPC calls");
  }
}

function resetForwarderConfig() {
  __resetForwarderConfigForTests();
}

test("relayer mode reuses deterministic wallets per user", async () => {
  const backup = snapshotEnv([
    "TX_MODE",
    "RELAYER_PRIVATE_KEY",
    "RELAYER_MNEMONIC",
    "RELAYER_USER_MNEMONIC",
    "RELAYER_SPONSOR_MNEMONIC",
    "EIP2771_TRUSTED_FORWARDER",
    "EIP2771_GAS_CEILING",
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

test("meta-tx signer estimates gas from the trusted forwarder context", async () => {
  const backup = snapshotEnv([
    "EIP2771_TRUSTED_FORWARDER",
    "EIP2771_GAS_BUFFER",
    "EIP2771_GAS_CEILING",
  ]);

  try {
    process.env.EIP2771_TRUSTED_FORWARDER = forwarderAddress;
    process.env.EIP2771_GAS_BUFFER = "25000";
    delete process.env.EIP2771_GAS_CEILING;
    resetForwarderConfig();

    const provider = new MockProvider();
    provider.queueEstimateGas(150_000n);

    const user = randomWallet().connect(provider);
    const relayer = randomWallet().connect(provider);
    const signer = new MetaTxSigner(user, relayer);

    const forwarderStub = {
      getNonce: async () => 1n,
      getFunction: () => ({
        populateTransaction: async () => ({
          to: forwarderAddress,
          data: "0x",
        }),
      }),
    };
    Reflect.set(signer, "forwarder", forwarderStub);

    const request = await Reflect.get(signer, "buildForwardRequest").call(signer, {
      to: user.address,
      data: "0x",
    } satisfies ethers.TransactionRequest);

    assert.equal(provider.estimateGasCalls.length, 1);
    const estimateCall = provider.estimateGasCalls[0];
    assert.equal(typeof estimateCall.from, "string");
    const from = (estimateCall.from as string).toLowerCase();
    assert.equal(from, forwarderAddress.toLowerCase());
    assert.equal(
      request.gas,
      150_000n + BigInt(process.env.EIP2771_GAS_BUFFER ?? "25000"),
    );
  } finally {
    resetForwarderConfig();
    restoreEnv(backup);
  }
});

test("meta-tx signer falls back to a conservative gas ceiling when estimation fails", async () => {
  const backup = snapshotEnv([
    "EIP2771_TRUSTED_FORWARDER",
    "EIP2771_GAS_BUFFER",
    "EIP2771_GAS_CEILING",
  ]);

  try {
    process.env.EIP2771_TRUSTED_FORWARDER = forwarderAddress;
    process.env.EIP2771_GAS_BUFFER = "25000";
    process.env.EIP2771_GAS_CEILING = "900000";
    resetForwarderConfig();

    const provider = new MockProvider();
    provider.queueEstimateGas(new Error("boom"));

    const user = randomWallet().connect(provider);
    const relayer = randomWallet().connect(provider);
    const signer = new MetaTxSigner(user, relayer);

    let capturedRequest: any;
    const forwarderStub = {
      getNonce: async () => 1n,
      getFunction: () => ({
        populateTransaction: async (request: unknown) => {
          capturedRequest = request;
          return {
            to: forwarderAddress,
            data: "0x",
          };
        },
      }),
    };
    Reflect.set(signer, "forwarder", forwarderStub);

    const sent: ethers.TransactionRequest[] = [];
    const relayerWallet = Reflect.get(signer, "relayerWallet");
    relayerWallet.sendTransaction = async (tx: ethers.TransactionRequest) => {
      sent.push(tx);
      return tx as unknown as ethers.TransactionResponse;
    };

    await signer.sendTransaction({
      to: user.address,
      data: "0x",
    });

    const fallback = BigInt(process.env.EIP2771_GAS_CEILING ?? "0");
    const buffer = BigInt(process.env.EIP2771_GAS_BUFFER ?? "0");

    assert.equal(provider.estimateGasCalls.length, 1);
    assert.equal((capturedRequest ?? {}).gas, fallback);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].gasLimit, fallback + buffer);
  } finally {
    resetForwarderConfig();
    restoreEnv(backup);
  }
});
