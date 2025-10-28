import { JobPayload, NodeDescriptor, ShardId } from './types';

export const SHARDS: ShardId[] = ['earth', 'mars', 'luna', 'helios', 'edge'];

export const DEFAULT_REROUTE_BUDGET: Record<ShardId, number> = {
  earth: 0.2,
  mars: 0.35,
  luna: 0.25,
  helios: 0.4,
  edge: 0.15,
};

export const OWNER_COMMAND_CATALOG = [
  {
    name: 'pauseFabric',
    description:
      'Pause global orchestration while keeping shards online for safe-mode operations.',
    parameters: { reason: 'Human readable justification for audit trail.' },
  },
  {
    name: 'resumeFabric',
    description:
      'Resume orchestration after a pause command has been validated.',
    parameters: {},
  },
  {
    name: 'rerouteShardTo',
    description:
      'Redirect a percentage of a shard queue to an assisting shard to smooth overload spikes.',
    parameters: {
      origin: 'Shard experiencing overload.',
      destination: 'Shard receiving spillover workload.',
      percentage: 'Value between 0 and 1 describing traffic to route.',
    },
  },
  {
    name: 'boostNodeCapacity',
    description:
      'Reconfigure a node container to temporarily expand concurrency for critical missions.',
    parameters: {
      nodeId: 'Identifier of the node to boost.',
      multiplier: 'Capacity multiplier to apply (e.g. 1.5).',
      duration: 'Number of ticks before capacity reverts.',
    },
  },
  {
    name: 'updateShardBudget',
    description:
      'Adjust the allowable spillover rate for a shard to react to macro conditions.',
    parameters: {
      shard: 'Shard to update.',
      budget: 'New spillover budget in the 0-1 range.',
    },
  },
] as const;

export const NODE_TOPOLOGY: NodeDescriptor[] = [
  {
    id: 'earth.hq-aquila',
    region: 'earth',
    capacity: 12,
    performance: 9,
    reliability: 0.995,
    specialties: ['governance', 'infrastructure', 'logistics'],
  },
  {
    id: 'earth.hq-analyst',
    region: 'earth',
    capacity: 10,
    performance: 7,
    reliability: 0.992,
    specialties: ['research', 'governance'],
  },
  {
    id: 'mars.gpu-helion',
    region: 'mars',
    capacity: 8,
    performance: 11,
    reliability: 0.985,
    specialties: ['science', 'infrastructure'],
  },
  {
    id: 'mars.landing-hub',
    region: 'mars',
    capacity: 6,
    performance: 8,
    reliability: 0.988,
    specialties: ['logistics', 'infrastructure'],
  },
  {
    id: 'luna.logistics-dione',
    region: 'luna',
    capacity: 7,
    performance: 6,
    reliability: 0.99,
    specialties: ['logistics', 'infrastructure'],
  },
  {
    id: 'luna.governance-forge',
    region: 'luna',
    capacity: 5,
    performance: 7,
    reliability: 0.992,
    specialties: ['governance', 'research'],
  },
  {
    id: 'helios.gpu-array',
    region: 'helios',
    capacity: 14,
    performance: 12,
    reliability: 0.978,
    specialties: ['science', 'research'],
  },
  {
    id: 'edge.swarm-alpha',
    region: 'edge',
    capacity: 9,
    performance: 7,
    reliability: 0.987,
    specialties: ['infrastructure', 'logistics'],
  },
  {
    id: 'edge.relay-perseus',
    region: 'edge',
    capacity: 4,
    performance: 5,
    reliability: 0.994,
    specialties: ['governance', 'research'],
  },
];

export const DEFAULT_JOB_CATEGORIES: ReadonlyArray<JobPayload['category']> = [
  'research',
  'logistics',
  'governance',
  'infrastructure',
  'science',
];
