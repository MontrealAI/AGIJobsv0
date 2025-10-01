export const jobRegistryAbi = [
  {
    type: 'function',
    name: 'createJob',
    inputs: [
      { name: 'reward', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
      { name: 'specHash', type: 'bytes32' },
      { name: 'uri', type: 'string' }
    ],
    outputs: [{ name: 'jobId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'createJobWithAgentTypes',
    inputs: [
      { name: 'reward', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
      { name: 'agentTypes', type: 'uint8' },
      { name: 'specHash', type: 'bytes32' },
      { name: 'uri', type: 'string' }
    ],
    outputs: [{ name: 'jobId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'acknowledgeAndCreateJob',
    inputs: [
      { name: 'reward', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
      { name: 'specHash', type: 'bytes32' },
      { name: 'uri', type: 'string' }
    ],
    outputs: [{ name: 'jobId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'acknowledgeAndCreateJobWithAgentTypes',
    inputs: [
      { name: 'reward', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
      { name: 'agentTypes', type: 'uint8' },
      { name: 'specHash', type: 'bytes32' },
      { name: 'uri', type: 'string' }
    ],
    outputs: [{ name: 'jobId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'job',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [
      { name: 'employer', type: 'address' },
      { name: 'worker', type: 'address' },
      { name: 'reward', type: 'uint256' },
      { name: 'stake', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'createdAt', type: 'uint64' },
      { name: 'deadline', type: 'uint64' },
      { name: 'state', type: 'uint8' },
      { name: 'specHash', type: 'bytes32' },
      { name: 'uri', type: 'string' }
    ],
    stateMutability: 'view'
  },
  {
    type: 'event',
    name: 'JobCreated',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'employer', type: 'address', indexed: true },
      { name: 'agent', type: 'address', indexed: true },
      { name: 'reward', type: 'uint256', indexed: false },
      { name: 'stake', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'specHash', type: 'bytes32', indexed: false },
      { name: 'uri', type: 'string', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'AgentAssigned',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'agent', type: 'address', indexed: true },
      { name: 'subdomain', type: 'string', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'ResultSubmitted',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'worker', type: 'address', indexed: true },
      { name: 'resultHash', type: 'bytes32', indexed: false },
      { name: 'resultURI', type: 'string', indexed: false },
      { name: 'subdomain', type: 'string', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'ValidationStartTriggered',
    inputs: [{ name: 'jobId', type: 'uint256', indexed: true }]
  },
  {
    type: 'event',
    name: 'JobFinalized',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'worker', type: 'address', indexed: true }
    ]
  },
  {
    type: 'event',
    name: 'JobDisputed',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'caller', type: 'address', indexed: true }
    ]
  }
] as const;
