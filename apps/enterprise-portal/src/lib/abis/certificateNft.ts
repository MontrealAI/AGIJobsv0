export const certificateNftAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [
      { name: 'owner', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'tokenOfOwnerByIndex',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' }
    ],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'tokenURI',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'uri', type: 'string' }],
    stateMutability: 'view'
  },
  {
    type: 'event',
    name: 'CertificateMinted',
    inputs: [
      { name: 'to', type: 'address', indexed: true },
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'uriHash', type: 'bytes32', indexed: false }
    ]
  }
] as const;
