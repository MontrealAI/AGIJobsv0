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
    name: 'jobs',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'employer', type: 'address' },
          { name: 'agent', type: 'address' },
          { name: 'reward', type: 'uint128' },
          { name: 'stake', type: 'uint96' },
          { name: 'burnReceiptAmount', type: 'uint128' },
          { name: 'uriHash', type: 'bytes32' },
          { name: 'resultHash', type: 'bytes32' },
          { name: 'specHash', type: 'bytes32' },
          { name: 'packedMetadata', type: 'uint256' }
        ]
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'decodeJobMetadata',
    inputs: [{ name: 'packed', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'status', type: 'uint8' },
          { name: 'success', type: 'bool' },
          { name: 'burnConfirmed', type: 'bool' },
          { name: 'agentTypes', type: 'uint8' },
          { name: 'feePct', type: 'uint32' },
          { name: 'agentPct', type: 'uint32' },
          { name: 'deadline', type: 'uint64' },
          { name: 'assignedAt', type: 'uint64' }
        ]
      }
    ],
    stateMutability: 'pure'
  },
  {
    type: 'function',
    name: 'nextJobId',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'feePct',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getJobValidators',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getJobValidatorVote',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'validator', type: 'address' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'applyForJob',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'subdomain', type: 'string' },
      { name: 'proof', type: 'bytes32[]' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'submit',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'resultHash', type: 'bytes32' },
      { name: 'resultURI', type: 'string' },
      { name: 'subdomain', type: 'string' },
      { name: 'proof', type: 'bytes32[]' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'submitBurnReceipt',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'burnTxHash', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      { name: 'blockNumber', type: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'confirmEmployerBurn',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'burnTxHash', type: 'bytes32' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'finalize',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'pause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'unpause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'hasBurnReceipt',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'burnTxHash', type: 'bytes32' }
    ],
    outputs: [{ name: '', type: 'bool' }],
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
      { name: 'uriHash', type: 'bytes32', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'ApplicationSubmitted',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'applicant', type: 'address', indexed: true },
      { name: 'subdomain', type: 'string', indexed: false }
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
