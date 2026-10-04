// Matched against the compiled v2 JobRegistry ABI by registryAbi.test.ts.
export const jobRegistryAbi = [
  {
    inputs: [
      {
        name: 'reward',
        type: 'uint256',
      },
      {
        name: 'deadline',
        type: 'uint64',
      },
      {
        name: 'specHash',
        type: 'bytes32',
      },
      {
        name: 'uri',
        type: 'string',
      },
    ],
    name: 'createJob',
    outputs: [
      {
        name: 'jobId',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'reward',
        type: 'uint256',
      },
      {
        name: 'deadline',
        type: 'uint64',
      },
      {
        name: 'agentTypes',
        type: 'uint8',
      },
      {
        name: 'specHash',
        type: 'bytes32',
      },
      {
        name: 'uri',
        type: 'string',
      },
    ],
    name: 'createJobWithAgentTypes',
    outputs: [
      {
        name: 'jobId',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'reward',
        type: 'uint256',
      },
      {
        name: 'deadline',
        type: 'uint64',
      },
      {
        name: 'specHash',
        type: 'bytes32',
      },
      {
        name: 'uri',
        type: 'string',
      },
    ],
    name: 'acknowledgeAndCreateJob',
    outputs: [
      {
        name: 'jobId',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'reward',
        type: 'uint256',
      },
      {
        name: 'deadline',
        type: 'uint64',
      },
      {
        name: 'agentTypes',
        type: 'uint8',
      },
      {
        name: 'specHash',
        type: 'bytes32',
      },
      {
        name: 'uri',
        type: 'string',
      },
    ],
    name: 'acknowledgeAndCreateJobWithAgentTypes',
    outputs: [
      {
        name: 'jobId',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    name: 'jobs',
    outputs: [
      {
        name: 'employer',
        type: 'address',
      },
      {
        name: 'agent',
        type: 'address',
      },
      {
        name: 'reward',
        type: 'uint128',
      },
      {
        name: 'stake',
        type: 'uint96',
      },
      {
        name: 'burnReceiptAmount',
        type: 'uint128',
      },
      {
        name: 'uriHash',
        type: 'bytes32',
      },
      {
        name: 'resultHash',
        type: 'bytes32',
      },
      {
        name: 'specHash',
        type: 'bytes32',
      },
      {
        name: 'packedMetadata',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'packed',
        type: 'uint256',
      },
    ],
    name: 'decodeJobMetadata',
    outputs: [
      {
        components: [
          {
            name: 'state',
            type: 'uint8',
          },
          {
            name: 'success',
            type: 'bool',
          },
          {
            name: 'burnConfirmed',
            type: 'bool',
          },
          {
            name: 'agentTypes',
            type: 'uint8',
          },
          {
            name: 'feePct',
            type: 'uint32',
          },
          {
            name: 'agentPct',
            type: 'uint32',
          },
          {
            name: 'deadline',
            type: 'uint64',
          },
          {
            name: 'assignedAt',
            type: 'uint64',
          },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextJobId',
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'feePct',
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'jobId',
        type: 'uint256',
      },
    ],
    name: 'getJobValidators',
    outputs: [
      {
        name: '',
        type: 'address[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'jobId',
        type: 'uint256',
      },
      {
        name: 'validator',
        type: 'address',
      },
    ],
    name: 'getJobValidatorVote',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'jobId',
        type: 'uint256',
      },
      {
        name: 'subdomain',
        type: 'string',
      },
      {
        name: 'proof',
        type: 'bytes32[]',
      },
    ],
    name: 'applyForJob',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'jobId',
        type: 'uint256',
      },
      {
        name: 'resultHash',
        type: 'bytes32',
      },
      {
        name: 'resultURI',
        type: 'string',
      },
      {
        name: 'subdomain',
        type: 'string',
      },
      {
        name: 'proof',
        type: 'bytes32[]',
      },
    ],
    name: 'submit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'jobId',
        type: 'uint256',
      },
      {
        name: 'burnTxHash',
        type: 'bytes32',
      },
      {
        name: 'amount',
        type: 'uint256',
      },
      {
        name: 'blockNumber',
        type: 'uint256',
      },
    ],
    name: 'submitBurnReceipt',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'jobId',
        type: 'uint256',
      },
      {
        name: 'burnTxHash',
        type: 'bytes32',
      },
    ],
    name: 'confirmEmployerBurn',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'jobId',
        type: 'uint256',
      },
    ],
    name: 'finalize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'pause',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        name: 'jobId',
        type: 'uint256',
      },
      {
        name: 'burnTxHash',
        type: 'bytes32',
      },
    ],
    name: 'hasBurnReceipt',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'jobId',
        type: 'uint256',
      },
      {
        indexed: true,
        name: 'employer',
        type: 'address',
      },
      {
        indexed: true,
        name: 'agent',
        type: 'address',
      },
      {
        indexed: false,
        name: 'reward',
        type: 'uint256',
      },
      {
        indexed: false,
        name: 'stake',
        type: 'uint256',
      },
      {
        indexed: false,
        name: 'fee',
        type: 'uint256',
      },
      {
        indexed: false,
        name: 'specHash',
        type: 'bytes32',
      },
      {
        indexed: false,
        name: 'uri',
        type: 'string',
      },
    ],
    name: 'JobCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'jobId',
        type: 'uint256',
      },
      {
        indexed: true,
        name: 'applicant',
        type: 'address',
      },
      {
        indexed: false,
        name: 'subdomain',
        type: 'string',
      },
    ],
    name: 'ApplicationSubmitted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'jobId',
        type: 'uint256',
      },
      {
        indexed: true,
        name: 'agent',
        type: 'address',
      },
      {
        indexed: false,
        name: 'subdomain',
        type: 'string',
      },
    ],
    name: 'AgentAssigned',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'jobId',
        type: 'uint256',
      },
      {
        indexed: true,
        name: 'worker',
        type: 'address',
      },
      {
        indexed: false,
        name: 'resultHash',
        type: 'bytes32',
      },
      {
        indexed: false,
        name: 'resultURI',
        type: 'string',
      },
      {
        indexed: false,
        name: 'subdomain',
        type: 'string',
      },
    ],
    name: 'ResultSubmitted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'jobId',
        type: 'uint256',
      },
    ],
    name: 'ValidationStartTriggered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'jobId',
        type: 'uint256',
      },
      {
        indexed: true,
        name: 'worker',
        type: 'address',
      },
    ],
    name: 'JobFinalized',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'jobId',
        type: 'uint256',
      },
      {
        indexed: true,
        name: 'caller',
        type: 'address',
      },
    ],
    name: 'JobDisputed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'jobId',
        type: 'uint256',
      },
      {
        indexed: false,
        name: 'success',
        type: 'bool',
      },
    ],
    name: 'JobCompleted',
    type: 'event',
  },
] as const;
