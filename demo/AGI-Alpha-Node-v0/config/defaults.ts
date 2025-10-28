export const DEFAULT_CONFIG = {
  ens: {
    rootNode: 'alpha.node.agi.eth',
    chainId: 1,
    nameWrapper: '0x0000000000000000000000000000000000000000'
  },
  contracts: {
    jobRegistry: '0x0000000000000000000000000000000000000000',
    stakeManager: '0x0000000000000000000000000000000000000000',
    platformIncentives: '0x0000000000000000000000000000000000000000',
    feePool: '0x0000000000000000000000000000000000000000',
    token: '0x0000000000000000000000000000000000000000'
  },
  staking: {
    minimumStake: '5000',
    heartbeatIntervalSeconds: 3600,
    slashPenaltyBps: 1500
  },
  ai: {
    planner: {
      rolloutDepth: 6,
      explorationConstant: 1.25
    },
    antifragile: {
      shockFrequencyMinutes: 15,
      recoveryBackoffMinutes: 60
    }
  },
  jobs: {
    maxConcurrent: 12,
    applyFilter: ['research', 'defi', 'infrastructure'],
    autopayout: true
  },
  observability: {
    prometheusPort: 9464,
    dashboardPort: 8443,
    metricsNamespace: 'agi-alpha-node'
  }
};

export type AlphaNodeConfig = typeof DEFAULT_CONFIG;
