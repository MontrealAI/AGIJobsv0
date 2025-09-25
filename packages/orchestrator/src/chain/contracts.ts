import type { ethers } from "ethers";

type StubContract = {
  target: string;
  allowance?: (...args: unknown[]) => Promise<bigint>;
  approve?: (...args: unknown[]) => Promise<{ wait: () => Promise<void> }>;
  createJob?: (...args: unknown[]) => Promise<{ wait: () => Promise<void> }> & {
    staticCall?: (...callArgs: unknown[]) => Promise<void>;
  };
};

function createStubContract(): StubContract {
  return {
    target: "0x0000000000000000000000000000000000000000"
  };
}

export function loadContracts(_signer: ethers.Signer) {
  const erc20 = {
    ...createStubContract(),
    allowance: async () => 0n,
    approve: async () => ({ wait: async () => {} })
  };

  const jobRegistry = {
    ...createStubContract(),
    createJob: Object.assign(async () => ({ wait: async () => {} }), {
      staticCall: async () => {}
    }),
    applyForJob: async () => ({ wait: async () => {} }),
    completeJob: async () => ({ wait: async () => {} })
  };

  const stakeManager = { ...createStubContract() };
  const validationModule = {
    ...createStubContract(),
    finalize: async () => ({ wait: async () => {} })
  };

  return {
    erc20,
    jobRegistry,
    stakeManager,
    validationModule
  };
}
