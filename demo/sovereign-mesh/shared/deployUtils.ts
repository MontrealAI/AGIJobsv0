import type { Interface, Log } from "ethers";

type DeployedAddresses = {
  stake: string;
  job: string;
  validation: string;
  reputation: string;
  dispute: string;
  certificate: string;
  platformRegistry: string;
  jobRouter: string;
  platformIncentives: string;
  feePool: string;
  taxPolicy: string;
  identityRegistry: string;
  systemPause: string;
};

export function extractDeployedAddresses(iface: Interface, logs: readonly Log[]): DeployedAddresses {
  for (const log of logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "Deployed") {
        const args = parsed.args as unknown as string[];
        return {
          stake: args[0],
          job: args[1],
          validation: args[2],
          reputation: args[3],
          dispute: args[4],
          certificate: args[5],
          platformRegistry: args[6],
          jobRouter: args[7],
          platformIncentives: args[8],
          feePool: args[9],
          taxPolicy: args[10],
          identityRegistry: args[11],
          systemPause: args[12]
        };
      }
    } catch {
      // ignore log parsing failures
    }
  }
  throw new Error("Deployment log not found");
}
