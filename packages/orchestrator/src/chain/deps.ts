import { loadContracts as baseLoadContracts } from "./contracts.js";
import { getSignerForUser as baseGetSignerForUser } from "./provider.js";

type LoadContractsFn = typeof baseLoadContracts;
type GetSignerFn = typeof baseGetSignerForUser;

let loadContractsOverride: LoadContractsFn | null = null;
let getSignerOverride: GetSignerFn | null = null;

export function loadContracts(...args: Parameters<LoadContractsFn>) {
  const fn = loadContractsOverride ?? baseLoadContracts;
  return fn(...args);
}

export function getSignerForUser(...args: Parameters<GetSignerFn>) {
  const fn = getSignerOverride ?? baseGetSignerForUser;
  return fn(...args);
}

export function __setLoadContracts(fn: LoadContractsFn | null) {
  loadContractsOverride = fn;
}

export function __setGetSignerForUser(fn: GetSignerFn | null) {
  getSignerOverride = fn;
}
