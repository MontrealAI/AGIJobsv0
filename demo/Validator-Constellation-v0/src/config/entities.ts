import { HDNodeWallet } from "ethers";

export type Domain =
  | "deep-research"
  | "defi-risk"
  | "infrastructure"
  | "bio-safety";

export interface EntitySeed {
  readonly mnemonic: string;
  readonly path: string;
  readonly ensName: string;
  readonly role: "validator" | "agent" | "node";
  readonly domain: Domain;
  readonly stake: bigint;
  readonly budget?: bigint;
}

export interface DerivedIdentity {
  readonly wallet: HDNodeWallet;
  readonly ensName: string;
  readonly role: EntitySeed["role"];
  readonly domain: Domain;
  readonly stake: bigint;
  readonly budget?: bigint;
}

const BASE_MNEMONIC =
  "test test test test test test test test test test test junk";

const validatorSeeds: EntitySeed[] = [
  {
    mnemonic: BASE_MNEMONIC,
    path: "m/44'/60'/0'/0/101",
    ensName: "andromeda.club.agi.eth",
    role: "validator",
    domain: "deep-research",
    stake: 50_000n * 10n ** 18n,
  },
  {
    mnemonic: BASE_MNEMONIC,
    path: "m/44'/60'/0'/0/102",
    ensName: "rigel.club.agi.eth",
    role: "validator",
    domain: "defi-risk",
    stake: 45_000n * 10n ** 18n,
  },
  {
    mnemonic: BASE_MNEMONIC,
    path: "m/44'/60'/0'/0/103",
    ensName: "vega.club.agi.eth",
    role: "validator",
    domain: "infrastructure",
    stake: 48_000n * 10n ** 18n,
  },
  {
    mnemonic: BASE_MNEMONIC,
    path: "m/44'/60'/0'/0/104",
    ensName: "sagitta.alpha.club.agi.eth",
    role: "validator",
    domain: "bio-safety",
    stake: 43_000n * 10n ** 18n,
  },
  {
    mnemonic: BASE_MNEMONIC,
    path: "m/44'/60'/0'/0/105",
    ensName: "orion.alpha.club.agi.eth",
    role: "validator",
    domain: "deep-research",
    stake: 47_500n * 10n ** 18n,
  },
  {
    mnemonic: BASE_MNEMONIC,
    path: "m/44'/60'/0'/0/106",
    ensName: "cassiopeia.club.agi.eth",
    role: "validator",
    domain: "defi-risk",
    stake: 46_000n * 10n ** 18n,
  },
];

const agentSeeds: EntitySeed[] = [
  {
    mnemonic: BASE_MNEMONIC,
    path: "m/44'/60'/0'/0/111",
    ensName: "athena.agent.agi.eth",
    role: "agent",
    domain: "deep-research",
    stake: 0n,
    budget: 2_000n * 10n ** 18n,
  },
  {
    mnemonic: BASE_MNEMONIC,
    path: "m/44'/60'/0'/0/112",
    ensName: "moneta.agent.agi.eth",
    role: "agent",
    domain: "defi-risk",
    stake: 0n,
    budget: 1_800n * 10n ** 18n,
  },
  {
    mnemonic: BASE_MNEMONIC,
    path: "m/44'/60'/0'/0/113",
    ensName: "selene.alpha.agent.agi.eth",
    role: "agent",
    domain: "bio-safety",
    stake: 0n,
    budget: 1_500n * 10n ** 18n,
  },
];

const nodeSeeds: EntitySeed[] = [
  {
    mnemonic: BASE_MNEMONIC,
    path: "m/44'/60'/0'/0/121",
    ensName: "atlas.node.agi.eth",
    role: "node",
    domain: "infrastructure",
    stake: 0n,
  },
  {
    mnemonic: BASE_MNEMONIC,
    path: "m/44'/60'/0'/0/122",
    ensName: "helios.alpha.node.agi.eth",
    role: "node",
    domain: "deep-research",
    stake: 0n,
  },
];

export const entitySeeds: EntitySeed[] = [
  ...validatorSeeds,
  ...agentSeeds,
  ...nodeSeeds,
];

export function deriveIdentity(seed: EntitySeed): DerivedIdentity {
  const wallet = HDNodeWallet.fromPhrase(seed.mnemonic, undefined, seed.path);
  return {
    wallet,
    ensName: seed.ensName,
    role: seed.role,
    domain: seed.domain,
    stake: seed.stake,
    budget: seed.budget,
  };
}

export function deriveAllIdentities(): DerivedIdentity[] {
  return entitySeeds.map(deriveIdentity);
}
