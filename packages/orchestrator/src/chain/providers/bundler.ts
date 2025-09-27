import { ethers } from "ethers";
import { userOperationToJson, type UserOperationStruct } from "./userOperation.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown[];
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: JsonRpcError;
}

export interface BundlerSendOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface UserOperationReceipt {
  userOpHash: string;
  entryPoint: string;
  sender: string;
  nonce: string;
  actualGasCost: string;
  actualGasUsed: string;
  success: boolean;
  logs: ethers.Log[];
  receipt?: ethers.TransactionReceipt;
}

export class BundlerClient {
  constructor(private readonly url: string, private readonly headers: Record<string, string> = {}) {
    if (!url) {
      throw new Error("Bundler RPC URL is required for Account Abstraction mode");
    }
  }

  private async rpcRequest<T>(method: string, params: unknown[]): Promise<T> {
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    };
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Bundler RPC error: ${response.status} ${text}`);
    }
    const parsed = (await response.json()) as JsonRpcResponse<T>;
    if (parsed.error) {
      throw new Error(parsed.error.message ?? "Unknown bundler error");
    }
    if (parsed.result === undefined) {
      throw new Error("Bundler RPC returned empty result");
    }
    return parsed.result;
  }

  async sendUserOperation(userOp: UserOperationStruct, entryPoint: string): Promise<string> {
    const payload = userOperationToJson(userOp);
    return this.rpcRequest<string>("eth_sendUserOperation", [payload, entryPoint]);
  }

  async getUserOperationReceipt(userOpHash: string): Promise<UserOperationReceipt | null> {
    const receipt = await this.rpcRequest<UserOperationReceipt | null>("eth_getUserOperationReceipt", [userOpHash]);
    return receipt;
  }

  async waitForUserOperation(
    userOpHash: string,
    options: BundlerSendOptions = {}
  ): Promise<UserOperationReceipt | null> {
    const { pollIntervalMs = 2_000, timeoutMs = 120_000 } = options;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const receipt = await this.getUserOperationReceipt(userOpHash);
      if (receipt) {
        return receipt;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    return null;
  }
}

