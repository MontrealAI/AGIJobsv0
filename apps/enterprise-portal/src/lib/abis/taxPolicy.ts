export const taxPolicyAbi = [
  {
    type: 'function',
    name: 'acknowledge',
    inputs: [],
    outputs: [{ name: 'disclaimer', type: 'string' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'acknowledgement',
    inputs: [],
    outputs: [{ name: 'disclaimer', type: 'string' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'hasAcknowledged',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'policyDetails',
    inputs: [],
    outputs: [
      { name: 'acknowledgement', type: 'string' },
      { name: 'uri', type: 'string' }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'acknowledgedVersion',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: 'version', type: 'uint256' }],
    stateMutability: 'view'
  }
] as const;
