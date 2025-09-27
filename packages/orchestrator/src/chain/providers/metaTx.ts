import { ethers } from "ethers";
import { policyManager, extractPolicyContext } from "../../policy/index.js";
import { getRelayerSponsorWallet, getRelayerUserWallet } from "./relayer.js";

const FORWARDER_ABI = [
  "function getNonce(address from) view returns (uint256)",
  "function execute((address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data) req,bytes signature) payable returns (bool,bytes)",
];

const policy = policyManager();

interface ForwarderConfig {
  address: string;
  gasBuffer: bigint;
}

function resolveForwarder(): ForwarderConfig {
  const address =
    process.env.EIP2771_TRUSTED_FORWARDER ??
    process.env.TRUSTED_FORWARDER_ADDRESS ??
    process.env.FORWARDER_ADDRESS ??
    "";
  if (!address) {
    throw new Error("EIP2771 trusted forwarder address must be configured");
  }
  const gasBufferRaw = process.env.EIP2771_GAS_BUFFER ?? process.env.RELAYER_GAS_BUFFER;
  let gasBuffer = 25_000n;
  if (gasBufferRaw) {
    try {
      gasBuffer = BigInt(gasBufferRaw);
    } catch (error) {
      console.warn("Failed to parse EIP2771_GAS_BUFFER", error);
    }
  }
  return { address: ethers.getAddress(address), gasBuffer };
}

let forwarderConfigCache: ForwarderConfig | null = null;

function getForwarderConfig(): ForwarderConfig {
  if (!forwarderConfigCache) {
    forwarderConfigCache = resolveForwarder();
  }
  return forwarderConfigCache;
}

class MetaTxSigner extends ethers.AbstractSigner {
  private readonly userWallet: ethers.Wallet;

  private readonly relayerWallet: ethers.Wallet;

  private readonly forwarder: ethers.Contract;

  private chainId?: bigint;

  constructor(userWallet: ethers.Wallet, relayerWallet: ethers.Wallet) {
    const provider = relayerWallet.provider ?? userWallet.provider ?? new ethers.JsonRpcProvider();
    super(provider);
    this.userWallet = userWallet.connect(provider);
    this.relayerWallet = relayerWallet.connect(provider);
    const config = getForwarderConfig();
    this.forwarder = new ethers.Contract(
      config.address,
      FORWARDER_ABI,
      this.relayerWallet
    );
  }

  connect(provider: ethers.Provider): MetaTxSigner {
    const user = this.userWallet.connect(provider);
    const relayer = this.relayerWallet.connect(provider);
    return new MetaTxSigner(user, relayer);
  }

  async getAddress(): Promise<string> {
    return this.userWallet.address;
  }

  async signMessage(message: ethers.BytesLike | string): Promise<string> {
    return this.userWallet.signMessage(message);
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, Array<ethers.TypedDataField>>,
    value: Record<string, unknown>
  ): Promise<string> {
    return this.userWallet.signTypedData(domain, types, value);
  }

  async signTransaction(): Promise<string> {
    throw new Error("Meta-transaction signer does not support signTransaction");
  }

  private async ensureChainId(): Promise<bigint> {
    if (this.chainId) {
      return this.chainId;
    }
    const provider = this.provider;
    if (!provider) {
      throw new Error("Signer provider is not configured");
    }
    const network = await provider.getNetwork();
    this.chainId = BigInt(network.chainId);
    return this.chainId;
  }

  private async buildForwardRequest(tx: ethers.TransactionRequest) {
    const provider = this.provider;
    if (!provider) {
      throw new Error("Signer provider is not configured");
    }
    const config = getForwarderConfig();
    const from = await this.getAddress();
    const nonce: ethers.BigNumberish = await this.forwarder.getNonce(from);
    let gasLimit = tx.gasLimit !== undefined && tx.gasLimit !== null ? ethers.toBigInt(tx.gasLimit) : 0n;
    if (gasLimit === 0n) {
      try {
        const estimate = await provider.estimateGas({
          from: this.relayerWallet.address,
          to: tx.to ?? undefined,
          data: tx.data ?? undefined,
          value: tx.value ?? undefined,
        });
        gasLimit = BigInt(estimate);
      } catch (error) {
        console.warn("Failed to estimate gas for meta-tx", error);
      }
    }
    gasLimit += config.gasBuffer;
    return {
      from,
      to: tx.to ?? ethers.ZeroAddress,
      value: BigInt(tx.value ?? 0),
      gas: gasLimit,
      nonce: BigInt(nonce),
      data: tx.data ?? "0x",
    };
  }

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    const policyContext = extractPolicyContext(tx.customData?.policy);
    if (policyContext.jobBudgetWei && policyContext.jobId) {
      policy.registerJobBudget(policyContext.jobId, policyContext.jobBudgetWei);
    }

    const config = getForwarderConfig();
    const request = await this.buildForwardRequest(tx);
    const chainId = await this.ensureChainId();

    const domain = {
      name: "MinimalForwarder",
      version: "0.0.1",
      chainId: Number(chainId),
      verifyingContract: config.address,
    };

    const types: Record<string, Array<ethers.TypedDataField>> = {
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
    };

    const signature = await this.userWallet.signTypedData(domain, types, request);

    const executeFn = this.forwarder.getFunction("execute");
    const executeTx = await executeFn.populateTransaction(request, signature);
    executeTx.gasLimit = executeTx.gasLimit ?? (request.gas + config.gasBuffer);

    const provider = this.provider;
    if (!provider) {
      throw new Error("Signer provider is not configured");
    }
    const feeData = await provider.getFeeData();
    const maxFee = BigInt(feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits("30", "gwei"));
    const estimatedGas = executeTx.gasLimit !== undefined && executeTx.gasLimit !== null
      ? ethers.toBigInt(executeTx.gasLimit)
      : request.gas + config.gasBuffer;
    const charge = {
      estimatedGas,
      estimatedCostWei: maxFee * estimatedGas,
    };

    policy.ensureWithinLimits(policyContext, charge);
    policy.recordUsage(policyContext, charge);

    const response = await this.relayerWallet.sendTransaction({
      ...executeTx,
      gasLimit: estimatedGas,
    });

    return response;
  }
}

export async function getMetaTxSigner(userId: string) {
  const userWallet = await getRelayerUserWallet(userId);
  const relayerWallet = await getRelayerSponsorWallet();
  return new MetaTxSigner(userWallet, relayerWallet);
}

