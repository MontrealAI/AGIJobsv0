import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ethers } from 'ethers';

import {
  AccountAbstractionSigner,
  type AccountAbstractionConfig,
} from '../../src/chain/providers/aa.js';
import {
  MetaTxSigner,
  __resetForwarderConfigForTests,
} from '../../src/chain/providers/metaTx.js';
import type { UserOperationStruct } from '../../src/chain/providers/userOperation.js';

const FIXTURE_PATH = path.resolve(process.cwd(), 'test/fixtures/aa-e2e.json');

interface SepoliaScenario {
  chainId: number;
  entryPoint: string;
  session: { privateKey: string; address?: string };
  tx: { to: string; data: string; value: string };
  policy: { userId: string; jobId: string; jobBudgetWei: string };
  provider: { estimateGas: string };
  feeData: { maxFeePerGas: string; maxPriorityFeePerGas: string };
  config: {
    verificationGasLimit: string;
    preVerificationGas: string;
    callGasBuffer: string;
    paymasterContext?: Record<string, unknown>;
  };
  nonce: string;
  paymaster: {
    paymasterAndData: string;
    preVerificationGas: string;
    verificationGasLimit: string;
    callGasLimit: string;
  };
  bundler: {
    userOpHash: string;
    actualGasCost: string;
    actualGasUsed: string;
  };
  expected: {
    transactionHash: string;
    blockNumber: number;
    blockHash: string;
    gasUsed: string;
    status: number;
    paymasterContext: Record<string, unknown>;
  };
}

interface OptimismScenario {
  chainId: number;
  forwarder: { address: string; nonce: string };
  user: { privateKey: string; address?: string };
  relayer: { privateKey: string };
  provider: { estimateGas: string };
  feeData: { maxFeePerGas: string; maxPriorityFeePerGas: string };
  metaTx: {
    policy: { userId: string; jobId: string; jobBudgetWei: string };
    request: { to: string; data: string; value: string };
    execute: { data: string; gasLimit: string | null };
    response: { hash: string; status: number };
  };
  expected: {
    forwardRequest: { gas: string; nonce: string };
    signature: string;
    relayerGasLimit: string;
  };
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as {
  sepolia: SepoliaScenario;
  optimismSepolia: OptimismScenario;
};

function toBigIntHex(value: string): bigint {
  return BigInt(value);
}

class MockAAProvider extends ethers.AbstractProvider {
  public readonly estimateGasCalls: ethers.TransactionRequest[] = [];

  public readonly waitedFor: string[] = [];

  constructor(private readonly scenario: SepoliaScenario & { sessionAddress: string }) {
    super({ name: 'mock', chainId: scenario.chainId });
  }

  async estimateGas(tx: ethers.TransactionRequest): Promise<bigint> {
    this.estimateGasCalls.push(tx);
    return BigInt(this.scenario.provider.estimateGas);
  }

  async getFeeData(): Promise<ethers.FeeData> {
    const maxFee = BigInt(this.scenario.feeData.maxFeePerGas);
    const maxPriority = BigInt(this.scenario.feeData.maxPriorityFeePerGas);
    return {
      gasPrice: maxFee,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: maxPriority,
      toJSON: () => ({
        gasPrice: ethers.toQuantity(maxFee),
        maxFeePerGas: ethers.toQuantity(maxFee),
        maxPriorityFeePerGas: ethers.toQuantity(maxPriority),
      }),
    } as ethers.FeeData;
  }

  async getNetwork(): Promise<ethers.Network> {
    return new ethers.Network('mock', this.scenario.chainId);
  }

  async waitForTransaction(hash: string): Promise<ethers.TransactionReceipt> {
    this.waitedFor.push(hash);
    return {
      hash: this.scenario.expected.transactionHash,
      transactionHash: this.scenario.expected.transactionHash,
      blockNumber: this.scenario.expected.blockNumber,
      blockHash: this.scenario.expected.blockHash,
      from: this.scenario.sessionAddress,
      to: this.scenario.tx.to,
      gasUsed: BigInt(this.scenario.expected.gasUsed),
      cumulativeGasUsed: BigInt(this.scenario.expected.gasUsed),
      effectiveGasPrice: BigInt(this.scenario.feeData.maxFeePerGas),
      status: this.scenario.expected.status,
      logs: [],
      logsBloom: `0x${'00'.repeat(256)}`,
      type: 2,
      confirmations: 1,
    } as unknown as ethers.TransactionReceipt;
  }

  async _perform(): Promise<never> {
    throw new Error('MockAAProvider does not support RPC operations');
  }
}

class MockBundler {
  public lastUserOperation: UserOperationStruct | null = null;

  public estimateInvocations = 0;

  constructor(private readonly scenario: SepoliaScenario & { sessionAddress: string }) {}

  async estimateUserOperationGas(userOp: UserOperationStruct) {
    this.estimateInvocations += 1;
    this.lastUserOperation = userOp;
    return {
      callGasLimit: BigInt(this.scenario.paymaster.callGasLimit),
      preVerificationGas: BigInt(this.scenario.paymaster.preVerificationGas),
      verificationGasLimit: BigInt(this.scenario.paymaster.verificationGasLimit),
    };
  }

  async sendUserOperation(userOp: UserOperationStruct): Promise<string> {
    this.lastUserOperation = userOp;
    return this.scenario.bundler.userOpHash;
  }

  async waitForUserOperation(hash: string) {
    if (hash !== this.scenario.bundler.userOpHash) {
      throw new Error('unexpected user operation hash');
    }
    return {
      userOpHash: hash,
      entryPoint: this.scenario.entryPoint,
      sender: this.lastUserOperation?.sender ?? this.scenario.sessionAddress,
      nonce: this.scenario.nonce,
      actualGasCost: this.scenario.bundler.actualGasCost,
      actualGasUsed: this.scenario.bundler.actualGasUsed,
      success: true,
      logs: [],
      receipt: { hash: this.scenario.expected.transactionHash },
    };
  }
}

class MockPaymaster {
  public readonly contexts: Array<Record<string, unknown> | undefined> = [];

  public readonly sponsored: UserOperationStruct[] = [];

  constructor(private readonly scenario: SepoliaScenario & { sessionAddress: string }) {}

  async sponsorUserOperation(params: {
    userOperation: UserOperationStruct;
    entryPoint: string;
    chainId: bigint;
    context?: Record<string, unknown>;
  }) {
    this.contexts.push(params.context);
    this.sponsored.push(params.userOperation);
    return {
      paymasterAndData: this.scenario.paymaster.paymasterAndData,
      preVerificationGas: this.scenario.paymaster.preVerificationGas,
      verificationGasLimit: this.scenario.paymaster.verificationGasLimit,
      callGasLimit: this.scenario.paymaster.callGasLimit,
    };
  }
}

class MockMetaProvider extends ethers.AbstractProvider {
  public readonly estimateGasCalls: ethers.TransactionRequest[] = [];

  constructor(private readonly scenario: OptimismScenario & { userAddress: string }) {
    super({ name: 'mock', chainId: scenario.chainId });
  }

  async estimateGas(tx: ethers.TransactionRequest): Promise<bigint> {
    this.estimateGasCalls.push(tx);
    return BigInt(this.scenario.provider.estimateGas);
  }

  async getFeeData(): Promise<ethers.FeeData> {
    const maxFee = BigInt(this.scenario.feeData.maxFeePerGas);
    const maxPriority = BigInt(this.scenario.feeData.maxPriorityFeePerGas);
    return {
      gasPrice: maxFee,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: maxPriority,
      toJSON: () => ({
        gasPrice: ethers.toQuantity(maxFee),
        maxFeePerGas: ethers.toQuantity(maxFee),
        maxPriorityFeePerGas: ethers.toQuantity(maxPriority),
      }),
    } as ethers.FeeData;
  }

  async getNetwork(): Promise<ethers.Network> {
    return new ethers.Network('mock', this.scenario.chainId);
  }

  async _perform(): Promise<never> {
    throw new Error('MockMetaProvider does not support RPC operations');
  }
}

class MockForwarder {
  public readonly requests: Array<{ request: any; signature: string }> = [];

  constructor(private readonly scenario: OptimismScenario & { userAddress: string }) {}

  async getNonce(): Promise<bigint> {
    return BigInt(this.scenario.forwarder.nonce);
  }

  getFunction(name: string) {
    if (name !== 'execute') {
      throw new Error(`Unexpected forwarder function ${name}`);
    }
    return {
      populateTransaction: async (request: unknown, signature: string) => {
        this.requests.push({ request, signature });
        return {
          to: this.scenario.forwarder.address,
          data: this.scenario.metaTx.execute.data,
          gasLimit: this.scenario.metaTx.execute.gasLimit
            ? BigInt(this.scenario.metaTx.execute.gasLimit)
            : undefined,
        } satisfies ethers.TransactionRequest;
      },
    };
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test('sepolia AA signer produces deterministic user operation with paymaster', async () => {
  const scenario = clone(fixture.sepolia);
  const sessionWallet = new ethers.Wallet(scenario.session.privateKey);
  scenario.session.address = sessionWallet.address;
  const provider = new MockAAProvider({ ...scenario, sessionAddress: sessionWallet.address });
  const wallet = sessionWallet.connect(provider);

  const config: AccountAbstractionConfig = {
    entryPoint: scenario.entryPoint,
    bundlerUrl: 'mock://bundler',
    bundlerHeaders: {},
    accountSalt: 0n,
    verificationGasLimit: toBigIntHex(scenario.config.verificationGasLimit),
    preVerificationGas: toBigIntHex(scenario.config.preVerificationGas),
    callGasBuffer: toBigIntHex(scenario.config.callGasBuffer),
    paymasterContext: scenario.config.paymasterContext,
  };

  const signer = new AccountAbstractionSigner(wallet, config);
  const bundler = new MockBundler({ ...scenario, sessionAddress: sessionWallet.address });
  const paymaster = new MockPaymaster({ ...scenario, sessionAddress: sessionWallet.address });
  Reflect.set(signer, 'bundler', bundler);
  Reflect.set(signer, 'entryPointContract', {
    getNonce: async () => BigInt(scenario.nonce),
  });
  const signerConfig = Reflect.get(signer, 'config') as AccountAbstractionConfig;
  signerConfig.paymaster = paymaster as unknown as AccountAbstractionConfig['paymaster'];

  const tx: ethers.TransactionRequest = {
    to: scenario.tx.to,
    data: scenario.tx.data,
    value: BigInt(scenario.tx.value),
    customData: {
      policy: {
        userId: scenario.policy.userId,
        jobId: scenario.policy.jobId,
        jobBudgetWei: BigInt(scenario.policy.jobBudgetWei),
      },
    },
  };

  const response = await signer.sendTransaction(tx);
  assert.equal(response.hash, scenario.bundler.userOpHash);

  assert.ok(bundler.lastUserOperation, 'user operation should be recorded');
  const userOp = bundler.lastUserOperation!;
  assert.equal(userOp.paymasterAndData, scenario.paymaster.paymasterAndData);
  assert.equal(userOp.callGasLimit, BigInt(scenario.paymaster.callGasLimit));
  assert.equal(userOp.verificationGasLimit, BigInt(scenario.paymaster.verificationGasLimit));
  assert.equal(userOp.preVerificationGas, BigInt(scenario.paymaster.preVerificationGas));

  assert.equal(paymaster.contexts.length, 1);
  assert.deepEqual(paymaster.contexts[0], scenario.expected.paymasterContext);

  const receipt = await response.wait();
  assert.ok(receipt);
  assert.equal(receipt.hash, scenario.expected.transactionHash);
  assert.equal(provider.waitedFor[0], scenario.expected.transactionHash);
});

test('optimism sepolia fallback meta-tx request is deterministic', async () => {
  const scenario = clone(fixture.optimismSepolia);
  const userWallet = new ethers.Wallet(scenario.user.privateKey);
  scenario.user.address = userWallet.address;
  const provider = new MockMetaProvider({ ...scenario, userAddress: userWallet.address });
  const user = userWallet.connect(provider);
  const relayer = new ethers.Wallet(scenario.relayer.privateKey, provider);

  const forwarder = new MockForwarder({ ...scenario, userAddress: userWallet.address });
  const relayerTxs: ethers.TransactionRequest[] = [];
  const relayerResponse = {
    hash: scenario.metaTx.response.hash,
    wait: async () => ({
      transactionHash: scenario.metaTx.response.hash,
      status: scenario.metaTx.response.status,
    }),
  } as unknown as ethers.TransactionResponse;

  __resetForwarderConfigForTests();
  process.env.EIP2771_TRUSTED_FORWARDER = scenario.forwarder.address;
  process.env.EIP2771_GAS_BUFFER = '25000';
  process.env.EIP2771_GAS_CEILING = '900000';

  const signer = new MetaTxSigner(user, relayer);
  Reflect.set(signer, 'forwarder', forwarder);
  const relayerWallet = Reflect.get(signer, 'relayerWallet') as ethers.Wallet;
  relayerWallet.sendTransaction = async (tx: ethers.TransactionRequest) => {
    relayerTxs.push(tx);
    return relayerResponse;
  };

  const response = await signer.sendTransaction({
    to: scenario.metaTx.request.to,
    data: scenario.metaTx.request.data,
    value: BigInt(scenario.metaTx.request.value),
    customData: {
      policy: {
        userId: scenario.metaTx.policy.userId,
        jobId: scenario.metaTx.policy.jobId,
        jobBudgetWei: BigInt(scenario.metaTx.policy.jobBudgetWei),
      },
    },
  });

  assert.equal(response.hash, scenario.metaTx.response.hash);
  assert.equal(forwarder.requests.length, 1);
  const forwarded = forwarder.requests[0];
  const request = forwarded.request as {
    gas: bigint | string;
    nonce: bigint | string;
  };
  const normalizedGas = BigInt(request.gas).toString(16);
  assert.equal(`0x${normalizedGas}`, scenario.expected.forwardRequest.gas.toLowerCase());
  assert.equal(
    BigInt(request.nonce).toString(),
    BigInt(scenario.expected.forwardRequest.nonce).toString()
  );
  const actualSignature = forwarder.requests[0].signature;
  assert.equal(actualSignature, scenario.expected.signature);

  assert.equal(provider.estimateGasCalls.length, 1);
  const gasCall = provider.estimateGasCalls[0];
  assert.equal(
    (gasCall.from as string).toLowerCase(),
    scenario.forwarder.address.toLowerCase()
  );

  assert.equal(relayerTxs.length, 1);
  assert.equal(
    BigInt(relayerTxs[0].gasLimit ?? 0n).toString(),
    BigInt(scenario.expected.relayerGasLimit).toString()
  );

  __resetForwarderConfigForTests();
  delete process.env.EIP2771_TRUSTED_FORWARDER;
  delete process.env.EIP2771_GAS_BUFFER;
  delete process.env.EIP2771_GAS_CEILING;
});
