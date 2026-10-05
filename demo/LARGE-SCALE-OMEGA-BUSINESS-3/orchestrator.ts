#!/usr/bin/env ts-node
export interface NationScenario {
  name: string;
  wallet: string;
  ensSubdomain: string;
  mission: string;
  specCid: string;
  resultCid: string;
  rewardTokens: string;
  deadlineHours: number;
}

export interface ValidatorScenario {
  name: string;
  wallet: string;
  ensSubdomain: string;
  mission: string;
}

export interface TreasuryScenario {
  name: string;
  wallet: string;
  ensSubdomain: string;
  mission: string;
}

export interface OmegaScenario {
  reportLabel: string;
  ipfsGateway: string;
  ensRoot: string;
  nations: NationScenario[];
  validators: ValidatorScenario[];
  treasury: TreasuryScenario;
}

// Compatibility entry point. The offline runtime uses only Node built-ins.
const scenarioTools = require('./lib/scenario.cjs');
export const sanitizeScope: (raw: string) => string =
  scenarioTools.sanitizeScope;
export const computeSha256: (filePath: string) => string | null =
  scenarioTools.computeSha256;
export const writeLedger: (
  scenario: OmegaScenario,
  ledgerPath: string
) => void = scenarioTools.writeLedger;
export const validateScenario: (scenario: OmegaScenario) => void =
  scenarioTools.validateScenario;
export async function main(): Promise<void> {
  process.exitCode = await require('./lib/mission.cjs').main();
}
if (require.main === module)
  main().catch((error) => {
    console.error('Omega orchestration failed:', error.message);
    process.exitCode = 1;
  });
