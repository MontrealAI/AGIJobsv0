import { ethers } from "ethers";
import { policyManager, extractPolicyContext, type PolicyCharge } from "../../policy/index.js";
import { deterministicWalletFromMnemonic } from "./signer.js";
import { BundlerClient, type BundlerSendOptions } from "./bundler.js";
import { ManagedPaymasterClient } from "./paymaster.js";
import {
  userOperationHash,
  type UserOperationStruct,
} from "./userOperation.js";

const ENTRY_POINT_ABI = ["function getNonce(address sender, uint192 key) view returns (uint256)"];

const SIMPLE_ACCOUNT_ABI = ["function execute(address dest,uint256 value,bytes func)"];

const SIMPLE_ACCOUNT_FACTORY_ABI = [
  "function getAddress(address owner,uint256 salt) view returns (address)",
  "function createAccount(address owner,uint256 salt) returns (address)",
];

interface AccountAbstractionConfig {
  entryPoint: string;
  bundlerUrl: string;
  bundlerHeaders: Record<string, string>;
  factory?: string;
  accountSalt: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  callGasBuffer: bigint;
  paymaster?: ManagedPaymasterClient;
  paymasterContext?: Record<string, unknown>;
  bundlerOptions?: BundlerSendOptions;
}

const policy = policyManager();

function parseBigIntEnv(name: string, fallback: bigint): bigint {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  try {
    return BigInt(raw);
  } catch (error) {
    console.warn(`Failed to parse ${name}`, error);
    return fallback;
  }
}

function parseRecordEnv(name: string): Record<string, unknown> | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    console.warn(`Failed to parse ${name}`, error);
  }
  return undefined;
}

function parseStringRecordEnv(name: string): Record<string, string> | undefined {
  const record = parseRecordEnv(name);
  if (!record) {
    return undefined;
  }
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null) {
      continue;
    }
    normalized[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return normalized;
}

function resolveConfig(): AccountAbstractionConfig {
  const bundlerUrl = process.env.AA_BUNDLER_RPC_URL ?? process.env.BUNDLER_RPC_URL ?? "";
  const entryPoint = process.env.AA_ENTRY_POINT ?? "";
  if (!bundlerUrl) {
    throw new Error("AA_BUNDLER_RPC_URL must be configured for Account Abstraction mode");
  }
  if (!entryPoint) {
    throw new Error("AA_ENTRY_POINT must be configured for Account Abstraction mode");
  }
  const paymasterUrl = process.env.AA_PAYMASTER_URL ?? process.env.PAYMASTER_RPC_URL;
  const paymasterHeaders = parseStringRecordEnv("AA_PAYMASTER_HEADERS");
  const paymasterContext = parseRecordEnv("AA_PAYMASTER_CONTEXT");
  const bundlerHeaders = parseStringRecordEnv("AA_BUNDLER_HEADERS") ?? {};
  const config: AccountAbstractionConfig = {
    entryPoint: ethers.getAddress(entryPoint),
    bundlerUrl,
    bundlerHeaders,
    factory: process.env.AA_ACCOUNT_FACTORY,
    accountSalt: parseBigIntEnv("AA_ACCOUNT_SALT", 0n),
    verificationGasLimit: parseBigIntEnv("AA_VERIFICATION_GAS_LIMIT", 1_500_000n),
    preVerificationGas: parseBigIntEnv("AA_PRE_VERIFICATION_GAS", 60_000n),
    callGasBuffer: parseBigIntEnv("AA_CALL_GAS_BUFFER", 25_000n),
    paymasterContext,
  };
  if (paymasterUrl) {
    config.paymaster = new ManagedPaymasterClient({
      url: paymasterUrl,
      apiKey: process.env.AA_PAYMASTER_API_KEY ?? process.env.PAYMASTER_API_KEY,
      method: process.env.AA_PAYMASTER_METHOD,
      headers: paymasterHeaders,
      sponsorContext: paymasterContext,
    });
  }
  const pollMsRaw = process.env.AA_BUNDLER_POLL_INTERVAL_MS;
  const timeoutRaw = process.env.AA_BUNDLER_TIMEOUT_MS;
  const options: BundlerSendOptions = {};
  if (pollMsRaw) {
    const value = Number(pollMsRaw);
    if (Number.isFinite(value) && value > 0) {
      options.pollIntervalMs = value;
    }
  }
  if (timeoutRaw) {
    const value = Number(timeoutRaw);
    if (Number.isFinite(value) && value > 0) {
      options.timeoutMs = value;
    }
  }
  if (options.pollIntervalMs || options.timeoutMs) {
    config.bundlerOptions = options;
  }
  return config;
}

let aaConfigCache: AccountAbstractionConfig | null = null;

function getAAConfig(): AccountAbstractionConfig {
  if (!aaConfigCache) {
    aaConfigCache = resolveConfig();
  }
  return aaConfigCache;
}

const simpleAccountInterface = new ethers.Interface(SIMPLE_ACCOUNT_ABI);

const factoryInterface = new ethers.Interface(SIMPLE_ACCOUNT_FACTORY_ABI);

const entryPointInterface = new ethers.Interface(ENTRY_POINT_ABI);

class AccountAbstractionSigner extends ethers.AbstractSigner {
  private smartAccountAddress?: string;

  private readonly config: AccountAbstractionConfig;

  private readonly bundler: BundlerClient;

  private readonly entryPointContract: ethers.Contract;

  private readonly factoryContract?: ethers.Contract;

  private chainId?: bigint;

  constructor(private readonly sessionWallet: ethers.Wallet, config = getAAConfig()) {
    super(sessionWallet.provider ?? new ethers.JsonRpcProvider());
    this.config = config;
    this.bundler = new BundlerClient(config.bundlerUrl, config.bundlerHeaders);
    this.entryPointContract = new ethers.Contract(
      config.entryPoint,
      entryPointInterface.fragments,
      this.sessionWallet.provider ?? new ethers.JsonRpcProvider()
    );
    if (config.factory) {
      this.factoryContract = new ethers.Contract(
        config.factory,
        factoryInterface.fragments,
        this.sessionWallet.provider ?? new ethers.JsonRpcProvider()
      );
    }
  }

  connect(provider: ethers.Provider): AccountAbstractionSigner {
    const wallet = this.sessionWallet.connect(provider);
    return new AccountAbstractionSigner(wallet, this.config);
  }

  async getAddress(): Promise<string> {
    if (this.smartAccountAddress) {
      return this.smartAccountAddress;
    }
    if (this.factoryContract) {
      try {
        const getAddressFn = this.factoryContract.getFunction("getAddress");
        const address = await getAddressFn.staticCall(
          this.sessionWallet.address,
          this.config.accountSalt
        );
        this.smartAccountAddress = ethers.getAddress(address);
        return this.smartAccountAddress;
      } catch (error) {
        console.warn("Failed to fetch smart account address, falling back to session wallet", error);
      }
    }
    this.smartAccountAddress = this.sessionWallet.address;
    return this.smartAccountAddress;
  }

  async signMessage(message: ethers.BytesLike | string): Promise<string> {
    return this.sessionWallet.signMessage(message);
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, Array<ethers.TypedDataField>>,
    value: Record<string, unknown>
  ): Promise<string> {
    return this.sessionWallet.signTypedData(domain, types, value);
  }

  async signTransaction(): Promise<string> {
    throw new Error("Account abstraction signer does not support signTransaction");
  }

  async estimateCallGas(tx: ethers.TransactionRequest, sender: string): Promise<bigint> {
    if (tx.gasLimit !== undefined && tx.gasLimit !== null) {
      return ethers.toBigInt(tx.gasLimit);
    }
    const provider = this.sessionWallet.provider;
    if (!provider) {
      return 0n;
    }
    try {
      const estimate = await provider.estimateGas({
        from: sender,
        to: tx.to ?? undefined,
        data: tx.data ?? undefined,
        value: tx.value ?? undefined,
      });
      return BigInt(estimate) + this.config.callGasBuffer;
    } catch (error) {
      console.warn("Gas estimation failed for user operation", error);
      return (tx.gasLimit !== undefined && tx.gasLimit !== null
        ? ethers.toBigInt(tx.gasLimit)
        : 0n) + this.config.callGasBuffer;
    }
  }

  private async ensureChainId(): Promise<bigint> {
    if (this.chainId) {
      return this.chainId;
    }
    const provider = this.sessionWallet.provider;
    if (!provider) {
      this.chainId = 0n;
      return this.chainId;
    }
    const network = await provider.getNetwork();
    this.chainId = BigInt(network.chainId);
    return this.chainId;
  }

  private async resolveNonce(sender: string): Promise<bigint> {
    try {
      const nonce: ethers.BigNumberish = await this.entryPointContract.getNonce(sender, 0);
      return BigInt(nonce);
    } catch (error) {
      console.warn("Failed to load entry point nonce", error);
      return 0n;
    }
  }

  private async resolveInitCode(sender: string): Promise<string> {
    if (!this.factoryContract) {
      return "0x";
    }
    const provider = this.sessionWallet.provider;
    if (!provider) {
      return "0x";
    }
    try {
      const code = await provider.getCode(sender);
      if (code && code !== "0x") {
        return "0x";
      }
    } catch (error) {
      console.warn("Failed to fetch account code", error);
      return "0x";
    }
    const encoded = factoryInterface.encodeFunctionData("createAccount", [
      this.sessionWallet.address,
      this.config.accountSalt,
    ]);
    return `${this.factoryContract.target}${encoded.slice(2)}`;
  }

  private async resolveFeeData(): Promise<{ maxFee: bigint; maxPriority: bigint }> {
    const provider = this.sessionWallet.provider;
    if (!provider) {
      return {
        maxFee: ethers.parseUnits("30", "gwei"),
        maxPriority: ethers.parseUnits("2", "gwei"),
      };
    }
    try {
      const feeData = await provider.getFeeData();
      const maxFee = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits("30", "gwei");
      const maxPriority = feeData.maxPriorityFeePerGas ?? ethers.parseUnits("2", "gwei");
      return { maxFee: BigInt(maxFee), maxPriority: BigInt(maxPriority) };
    } catch (error) {
      console.warn("Failed to fetch fee data", error);
      return {
        maxFee: ethers.parseUnits("30", "gwei"),
        maxPriority: ethers.parseUnits("2", "gwei"),
      };
    }
  }

  private async buildUserOperation(tx: ethers.TransactionRequest): Promise<{
    userOp: UserOperationStruct;
    charge: PolicyCharge;
  }> {
    const sender = await this.getAddress();
    const chainId = await this.ensureChainId();
    const callGasLimit = await this.estimateCallGas(tx, sender);
    const { maxFee, maxPriority } = await this.resolveFeeData();
    const initCode = await this.resolveInitCode(sender);
    const nonce = await this.resolveNonce(sender);
    const callData = simpleAccountInterface.encodeFunctionData("execute", [
      tx.to ?? ethers.ZeroAddress,
      tx.value ?? 0,
      tx.data ?? "0x",
    ]);

    let userOp: UserOperationStruct = {
      sender,
      nonce,
      initCode,
      callData,
      callGasLimit,
      verificationGasLimit: this.config.verificationGasLimit,
      preVerificationGas: this.config.preVerificationGas,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: maxPriority,
      paymasterAndData: "0x",
      signature: "0x",
    };

    if (this.config.paymaster) {
      const sponsorship = await this.config.paymaster.sponsorUserOperation({
        userOperation: userOp,
        entryPoint: this.config.entryPoint,
        chainId,
        context: this.config.paymasterContext,
      });
      userOp = {
        ...userOp,
        paymasterAndData: sponsorship.paymasterAndData ?? "0x",
        preVerificationGas: sponsorship.preVerificationGas
          ? BigInt(sponsorship.preVerificationGas)
          : userOp.preVerificationGas,
        verificationGasLimit: sponsorship.verificationGasLimit
          ? BigInt(sponsorship.verificationGasLimit)
          : userOp.verificationGasLimit,
        callGasLimit: sponsorship.callGasLimit
          ? BigInt(sponsorship.callGasLimit)
          : userOp.callGasLimit,
      };
    }

    const gasSum = userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas;
    const estimatedCostWei = userOp.maxFeePerGas * gasSum;

    return {
      userOp,
      charge: {
        estimatedGas: gasSum,
        estimatedCostWei,
      },
    };
  }

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    const policyContext = extractPolicyContext(tx.customData?.policy);

    if (policyContext.jobBudgetWei && policyContext.jobId) {
      policy.registerJobBudget(policyContext.jobId, policyContext.jobBudgetWei);
    }

    const { userOp, charge } = await this.buildUserOperation(tx);
    const chainId = await this.ensureChainId();
    const hash = userOperationHash(userOp, this.config.entryPoint, chainId);
    userOp.signature = await this.sessionWallet.signMessage(ethers.getBytes(hash));

    policy.ensureWithinLimits(policyContext, charge);
    policy.recordUsage(policyContext, charge);

    const userOpHash = await this.bundler.sendUserOperation(userOp, this.config.entryPoint);

    const provider = this.sessionWallet.provider ?? new ethers.JsonRpcProvider();

    const wait = async (confirmations?: number): Promise<ethers.TransactionReceipt> => {
      const receipt = await this.bundler.waitForUserOperation(userOpHash, this.config.bundlerOptions);
      if (!receipt?.receipt?.hash) {
        throw new Error("UserOperation not included in a transaction");
      }
      const mined = await provider.waitForTransaction(receipt.receipt.hash, confirmations);
      if (!mined) {
        throw new Error("Bundler transaction missing from chain");
      }
      return mined;
    };

    return {
      hash: userOpHash,
      from: userOp.sender,
      to: tx.to ?? null,
      nonce: Number(userOp.nonce),
      data: tx.data ?? "0x",
      value: BigInt(tx.value ?? 0),
      gasLimit: userOp.callGasLimit,
      maxFeePerGas: userOp.maxFeePerGas,
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
      chainId: Number(chainId),
      type: 2,
      wait,
      confirmations: 0,
    } as unknown as ethers.TransactionResponse;
  }
}

type CachedSession = { fingerprint: string; signer: AccountAbstractionSigner };

const aaSignerCache = new Map<string, CachedSession>();

function fingerprintFromEnv() {
  const key = process.env.AA_SESSION_PRIVATE_KEY;
  if (key) {
    return `pk:${key}`;
  }
  const mnemonic = process.env.AA_SESSION_MNEMONIC ?? process.env.RELAYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "AA_SESSION_MNEMONIC (or RELAYER_MNEMONIC) must be configured when AA_SESSION_PRIVATE_KEY is not provided."
    );
  }
  return `mnemonic:${ethers.id(mnemonic)}`;
}

function deriveSessionWallet(userId: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL ?? "http://127.0.0.1:8545");
  const key = process.env.AA_SESSION_PRIVATE_KEY;
  if (key) {
    return new ethers.Wallet(key, provider);
  }
  const mnemonic = process.env.AA_SESSION_MNEMONIC ?? process.env.RELAYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      "AA_SESSION_MNEMONIC (or RELAYER_MNEMONIC) must be configured when AA_SESSION_PRIVATE_KEY is not provided."
    );
  }
  return deterministicWalletFromMnemonic(mnemonic, userId, provider);
}

export async function getAAProvider(userId: string) {
  const fingerprint = fingerprintFromEnv();
  const cached = aaSignerCache.get(userId);
  if (cached && cached.fingerprint === fingerprint) {
    return cached.signer;
  }
  const sessionWallet = deriveSessionWallet(userId);
  const signer = new AccountAbstractionSigner(sessionWallet);
  aaSignerCache.set(userId, { fingerprint, signer });
  return signer;
}

