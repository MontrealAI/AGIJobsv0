import type { ICSType } from "../router";
import { formatAGIA, toWei } from "./common";

export async function* deposit(ics: ICSType): AsyncGenerator<string> {
  const stake = (ics.params as { stake?: Record<string, unknown> }).stake ?? {};
  const role = (stake.role as string) ?? "agent";
  const amount = formatAGIA(stake.amountAGIA as string | undefined);
  yield `Locking ${amount} AGIALPHA stake for ${role}.\n`;
  yield `Simulated deposit of ${toWei(amount).toString()} wei.\n`;
  yield `✅ Stake secured for ${role}.\n`;
}

export async function* withdraw(ics: ICSType): AsyncGenerator<string> {
  const stake = (ics.params as { stake?: Record<string, unknown> }).stake ?? {};
  const role = (stake.role as string) ?? "agent";
  const amount = formatAGIA(stake.amountAGIA as string | undefined);
  yield `Withdrawing ${amount} AGIALPHA stake for ${role}.\n`;
  yield `✅ Stake withdrawal prepared.\n`;
}
