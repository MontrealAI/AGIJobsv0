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
  }
] as const;
