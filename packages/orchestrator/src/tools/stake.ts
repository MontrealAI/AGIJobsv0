import { ethers } from "ethers";
import type { StakeIntent, WithdrawIntent } from "../router.js";
import { loadContracts } from "../chain/contracts.js";
import { getSignerForUser } from "../chain/provider.js";
import {
  buildDryRunResult,
  buildPolicyOverrides,
  formatError,
  hexlify,
  simulateContractCall,
  toWei,
  type DryRunResult,
  type ExecutionStepResult,
  type PreparedCallStep,
} from "./common.js";

function requireUserId(meta?: { userId?: string | null }): string {
  const candidate = meta?.userId?.trim();
  if (!candidate) {
    throw new Error("Missing meta.userId for signing.");
  }
  return candidate;
}

function normalizeRole(role: string) {
  const cleaned = role.trim().toLowerCase();
  switch (cleaned) {
    case "agent":
      return { index: 0, label: "Agent" };
    case "validator":
      return { index: 1, label: "Validator" };
    case "platform":
      return { index: 2, label: "Platform" };
    default:
      throw new Error(`Unsupported staking role: ${role}`);
  }
}

function buildCall(label: string, tx: ethers.TransactionRequest, gasEstimate: bigint, extra?: Record<string, unknown>): PreparedCallStep {
  return {
    label,
    to: (tx.to ?? ethers.ZeroAddress) as string,
    data: tx.data ?? "0x",
    value: hexlify(tx.value ?? 0),
    gasEstimate: hexlify(gasEstimate),
    result: extra,
  };
}

export async function depositDryRun(ics: StakeIntent): Promise<DryRunResult> {
  const userId = requireUserId(ics.meta);
  const normalizedRole = normalizeRole(ics.params.stake.role);
  const amountWei = toWei(ics.params.stake.amountAGIA);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { erc20, stakeManager } = loadContracts(signer);

  const owner = await signer.getAddress();
  const spender = stakeManager.target as string;
  const allowance = await erc20.allowance(owner, spender);

  const calls: PreparedCallStep[] = [];
  let approvalNeeded = allowance < amountWei;
  if (approvalNeeded) {
    const approveTx = await erc20.approve.populateTransaction(
      spender,
      amountWei,
      buildPolicyOverrides(ics.meta)
    );
    approveTx.from = owner;
    const approvalSimulation = await simulateContractCall(signer, approveTx);
    calls.push(
      buildCall("ERC20.approve", approveTx, approvalSimulation.gasEstimate, {
        spender,
        amountWei: amountWei.toString(),
      })
    );
  }

  const depositTx = await stakeManager.depositStake.populateTransaction(
    normalizedRole.index,
    amountWei,
    buildPolicyOverrides(ics.meta)
  );
  depositTx.from = owner;
  const depositSimulation = await simulateContractCall(signer, depositTx);
  calls.push(
    buildCall("StakeManager.depositStake", depositTx, depositSimulation.gasEstimate, {
      role: normalizedRole.label,
      amountWei: amountWei.toString(),
    })
  );

  const metadata: Record<string, unknown> = {
    role: normalizedRole.label,
    amountWei: amountWei.toString(),
    amountAGIA: ethers.formatEther(amountWei),
    approvalRequired: approvalNeeded,
  };

  return buildDryRunResult(owner, ics.meta?.txMode, calls, metadata);
}

export async function depositExecute(
  ics: StakeIntent
): Promise<ExecutionStepResult[]> {
  const userId = requireUserId(ics.meta);
  const normalizedRole = normalizeRole(ics.params.stake.role);
  const amountWei = toWei(ics.params.stake.amountAGIA);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { erc20, stakeManager } = loadContracts(signer);
  const owner = await signer.getAddress();
  const spender = stakeManager.target as string;
  const allowance = await erc20.allowance(owner, spender);

  const results: ExecutionStepResult[] = [];
  if (allowance < amountWei) {
    const approveTx = await erc20.approve(
      spender,
      amountWei,
      buildPolicyOverrides(ics.meta)
    );
    const approvalReceipt = await approveTx.wait();
    results.push({
      label: "ERC20.approve",
      txHash: approveTx.hash,
      receipt: approvalReceipt,
      metadata: {
        spender,
        amountWei: amountWei.toString(),
      },
    });
  }

  const depositTx = await stakeManager.depositStake(
    normalizedRole.index,
    amountWei,
    buildPolicyOverrides(ics.meta)
  );
  const depositReceipt = await depositTx.wait();
  results.push({
    label: "StakeManager.depositStake",
    txHash: depositTx.hash,
    receipt: depositReceipt,
    metadata: {
      role: normalizedRole.label,
      amountWei: amountWei.toString(),
      amountAGIA: ethers.formatEther(amountWei),
    },
  });

  return results;
}

export async function withdrawDryRun(ics: WithdrawIntent): Promise<DryRunResult> {
  const userId = requireUserId(ics.meta);
  const normalizedRole = normalizeRole(ics.params.stake.role);
  const amountWei = toWei(ics.params.stake.amountAGIA);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { stakeManager } = loadContracts(signer);
  const owner = await signer.getAddress();

  const tx = await stakeManager.withdrawStake.populateTransaction(
    normalizedRole.index,
    amountWei,
    buildPolicyOverrides(ics.meta)
  );
  tx.from = owner;
  const simulation = await simulateContractCall(signer, tx);
  const call = buildCall("StakeManager.withdrawStake", tx, simulation.gasEstimate, {
    role: normalizedRole.label,
    amountWei: amountWei.toString(),
  });

  const metadata: Record<string, unknown> = {
    role: normalizedRole.label,
    amountWei: amountWei.toString(),
    amountAGIA: ethers.formatEther(amountWei),
  };

  return buildDryRunResult(owner, ics.meta?.txMode, [call], metadata);
}

export async function withdrawExecute(
  ics: WithdrawIntent
): Promise<ExecutionStepResult[]> {
  const userId = requireUserId(ics.meta);
  const normalizedRole = normalizeRole(ics.params.stake.role);
  const amountWei = toWei(ics.params.stake.amountAGIA);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const { stakeManager } = loadContracts(signer);

  const tx = await stakeManager.withdrawStake(
    normalizedRole.index,
    amountWei,
    buildPolicyOverrides(ics.meta)
  );
  const receipt = await tx.wait();

  return [
    {
      label: "StakeManager.withdrawStake",
      txHash: tx.hash,
      receipt,
      metadata: {
        role: normalizedRole.label,
        amountWei: amountWei.toString(),
        amountAGIA: ethers.formatEther(amountWei),
      },
    },
  ];
}

export async function* deposit(ics: StakeIntent) {
  try {
    const dryRun = await depositDryRun(ics);
    yield renderStakeDryRun("Deposit stake", dryRun);
    if (ics.confirm === false) {
      yield "🧪 Dry-run completed. Set confirm=true to execute.\n";
      return;
    }
    const executions = await depositExecute(ics);
    for (const step of executions) {
      yield `⛓️ Tx submitted: ${step.txHash}\n`;
    }
    const last = executions[executions.length - 1];
    yield `✅ Deposited ${last.metadata?.amountAGIA ?? ics.params.stake.amountAGIA} AGIALPHA for ${last.metadata?.role ?? "stake"}.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

export async function* withdraw(ics: WithdrawIntent) {
  try {
    const dryRun = await withdrawDryRun(ics);
    yield renderStakeDryRun("Withdraw stake", dryRun);
    if (ics.confirm === false) {
      yield "🧪 Dry-run completed. Set confirm=true to execute.\n";
      return;
    }
    const [execution] = await withdrawExecute(ics);
    yield `⛓️ Tx submitted: ${execution.txHash}\n`;
    yield `✅ Withdrawn ${execution.metadata?.amountAGIA ?? ics.params.stake.amountAGIA} AGIALPHA from ${execution.metadata?.role ?? "stake"}.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

function renderStakeDryRun(title: string, result: DryRunResult): string {
  const lines: string[] = [];
  lines.push(`🔍 ${title} dry-run (${result.txMode})\n`);
  const metadata = result.metadata ?? {};
  if (metadata.amountAGIA) {
    lines.push(`• Amount: ${metadata.amountAGIA} AGIA\n`);
  }
  if (metadata.role) {
    lines.push(`• Role: ${metadata.role}\n`);
  }
  if (metadata.approvalRequired) {
    lines.push(`• Approval required before deposit\n`);
  }
  const primary = result.calls[0];
  if (primary?.gasEstimate) {
    try {
      const gas = BigInt(primary.gasEstimate);
      lines.push(`• Estimated gas (first step): ${gas.toString()}\n`);
    } catch (error) {
      console.warn("Failed to parse gas estimate", error);
    }
  }
  return lines.join("");
}
