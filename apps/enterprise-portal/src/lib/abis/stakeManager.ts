export const stakeManagerAbi = [
  {
    type: 'function',
    name: 'depositStake',
    inputs: [
      { name: 'role', type: 'uint8' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'stakeOf',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'role', type: 'uint8' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'minStake',
    inputs: [{ name: 'role', type: 'uint8' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  }
] as const;
