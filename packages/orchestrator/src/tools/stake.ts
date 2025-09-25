import type { StakeIntent, WithdrawIntent } from "../router";
import { loadContracts } from "../chain/contracts";
import { getSignerForUser } from "../chain/provider";
import { formatError, toWei } from "./common";

export async function* deposit(ics: StakeIntent) {
  const userId = ics.meta?.userId;
  if (!userId) {
    yield "Missing meta.userId for signing.\n";
    return;
  }

  try {
    const { amountAGIA, role } = ics.params.stake;
    const normalized = normalizeRole(role);
    const amountWei = toWei(amountAGIA);
    const signer = await getSignerForUser(userId);
    const { erc20, stakeManager } = loadContracts(signer);
    const owner = await signer.getAddress();
    const spender = stakeManager.target as string;
    const allowance = await erc20.allowance(owner, spender);
    if (allowance < amountWei) {
      const approveTx = await erc20.approve(spender, amountWei);
      yield `🪙 Approving ${spender} to spend ${amountAGIA} AGIALPHA…\n`;
      await approveTx.wait();
    }
    const tx = await stakeManager.depositStake(normalized.index, amountWei);
    yield `⛓️ Tx submitted: ${tx.hash}\n`;
    await tx.wait();
    yield `✅ Deposited ${amountAGIA} AGIALPHA for ${normalized.label} staking.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

export async function* withdraw(ics: WithdrawIntent) {
  const userId = ics.meta?.userId;
  if (!userId) {
    yield "Missing meta.userId for signing.\n";
    return;
  }

  try {
    const { amountAGIA, role } = ics.params.stake;
    const normalized = normalizeRole(role);
    const amountWei = toWei(amountAGIA);
    const signer = await getSignerForUser(userId);
    const { stakeManager } = loadContracts(signer);
    const tx = await stakeManager.withdrawStake(normalized.index, amountWei);
    yield `⛓️ Tx submitted: ${tx.hash}\n`;
    await tx.wait();
    yield `✅ Withdrawn ${amountAGIA} AGIALPHA from ${normalized.label} stake.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
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
