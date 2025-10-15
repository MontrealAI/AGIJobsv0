export const validationModuleAbi = [
  {
    type: 'event',
    name: 'ValidatorsSelected',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'validators', type: 'address[]', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'ValidationCommitted',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'validator', type: 'address', indexed: true },
      { name: 'commitHash', type: 'bytes32', indexed: false },
      { name: 'subdomain', type: 'string', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'ValidationRevealed',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'validator', type: 'address', indexed: true },
      { name: 'approve', type: 'bool', indexed: false },
      { name: 'burnTxHash', type: 'bytes32', indexed: false },
      { name: 'subdomain', type: 'string', indexed: false }
    ]
  },
  {
    type: 'function',
    name: 'validatorStakes',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'validator', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'jobNonce',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'commitValidation',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'commitHash', type: 'bytes32' },
      { name: 'subdomain', type: 'string' },
      { name: 'proof', type: 'bytes32[]' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'revealValidation',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'approve', type: 'bool' },
      { name: 'burnTxHash', type: 'bytes32' },
      { name: 'salt', type: 'bytes32' },
      { name: 'subdomain', type: 'string' },
      { name: 'proof', type: 'bytes32[]' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'selectValidators',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'entropy', type: 'uint256' }
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
    name: 'requiredValidatorApprovals',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'setRequiredValidatorApprovals',
    inputs: [{ name: 'count', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'validatorsPerJob',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'commitWindow',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'setCommitWindow',
    inputs: [{ name: 'seconds', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'revealWindow',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'setRevealWindow',
    inputs: [{ name: 'seconds', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable'
  }
] as const;
