import { userOperationToJson, type UserOperationStruct } from "./userOperation.js";

interface SponsorUserOperationParams {
  userOperation: UserOperationStruct;
  entryPoint: string;
  chainId: bigint;
  context?: Record<string, unknown>;
}

export interface SponsoredUserOperation {
  paymasterAndData: string;
  preVerificationGas?: string;
  verificationGasLimit?: string;
  callGasLimit?: string;
}

export interface ManagedPaymasterOptions {
  url: string;
  apiKey?: string;
  method?: string;
  headers?: Record<string, string>;
  sponsorContext?: Record<string, unknown>;
}

export class ManagedPaymasterClient {
  private readonly url: string;

  private readonly headers: Record<string, string>;

  private readonly method: string;

  private readonly sponsorContext?: Record<string, unknown>;

  constructor(options: ManagedPaymasterOptions) {
    this.url = options.url;
    this.method = options.method ?? "pm_sponsorUserOperation";
    this.sponsorContext = options.sponsorContext;
    if (!this.url) {
      throw new Error("Managed paymaster URL must be configured for Account Abstraction mode");
    }
    this.headers = {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    };
    if (options.apiKey) {
      this.headers.Authorization = `Bearer ${options.apiKey}`;
    }
  }

  async sponsorUserOperation(params: SponsorUserOperationParams): Promise<SponsoredUserOperation> {
    const payload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: this.method,
      params: [
        userOperationToJson(params.userOperation),
        {
          entryPoint: params.entryPoint,
          chainId: `0x${params.chainId.toString(16)}`,
          context: {
            ...(this.sponsorContext ?? {}),
            ...(params.context ?? {}),
          },
        },
      ],
    };
    const response = await fetch(this.url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Paymaster RPC error: ${response.status} ${text}`);
    }
    const parsed = (await response.json()) as {
      result?: SponsoredUserOperation;
      error?: { message?: string };
    };
    if (parsed.error) {
      throw new Error(parsed.error.message ?? "Managed paymaster error");
    }
    if (!parsed.result) {
      throw new Error("Managed paymaster returned empty sponsorship");
    }
    return parsed.result;
  }
}

