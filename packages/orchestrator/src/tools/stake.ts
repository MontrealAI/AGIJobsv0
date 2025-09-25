import type { ICSType } from "../router";

export async function* deposit(ics: ICSType) {
  const stake = (ics.params as any)?.stake ?? {};
  if (!stake.amountAGIA) {
    yield "Missing stake amount.\n";
    return;
  }

  yield `🔐 Locking ${stake.amountAGIA} AGIALPHA stake (stub).\n`;
  yield "✅ Stake deposited (scaffolding stub).\n";
}

export async function* withdraw(ics: ICSType) {
  const stake = (ics.params as any)?.stake ?? {};
  if (!stake.amountAGIA) {
    yield "Missing stake amount.\n";
    return;
  }

  yield `🔓 Releasing ${stake.amountAGIA} AGIALPHA stake (stub).\n`;
  yield "✅ Stake withdrawal complete (scaffolding stub).\n";
}
