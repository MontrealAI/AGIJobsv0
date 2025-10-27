import { EnsIdentity } from './ens';

export const validatorIdentities: EnsIdentity[] = [
  {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    ensName: 'rigel.club.agi.eth',
    ensNode: '0xf7dcb3d2b692274f2af04fe86c0abf51ac3aaee47cebb6a42199d9db6466b740',
  },
  {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    ensName: 'betelgeuse.club.agi.eth',
    ensNode: '0x6a1e346f0f9d8bca9e507f3c9f6e45b73c5f1f8907e7a9176f79d37718c1c2b5',
  },
  {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    ensName: 'antares.club.agi.eth',
    ensNode: '0xbc1dce2c7aaf1e81eed0cc0633d5c0e54796aaf01fef0751bcb5ffb5bbcc74fd',
  },
  {
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    ensName: 'deneb.alpha.club.agi.eth',
    ensNode: '0x30a7a27bac53cdeb538285b621f081e6e33d7e6446104548932e8def5a0e327d',
  },
  {
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    ensName: 'vega.alpha.club.agi.eth',
    ensNode: '0x6ca0123bd17857c520fab3e1db26945d2f57c324081e6f7dd4d09bbdd0c9ef68',
  },
];

export const agentIdentities: EnsIdentity[] = [
  {
    address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    ensName: 'athena.agent.agi.eth',
    ensNode: '0xd5c99d8b931f3a9ec4ab4e55ce49963cf343577b6c7d4292dccd144cf97ecf7d',
  },
  {
    address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
    ensName: 'daedalus.alpha.agent.agi.eth',
    ensNode: '0xbf95b3239ab1b35fe2b4acc6e37445f43aec15e9c4a008d8f1ab367ad06f5d35',
  },
];

export const domainIds = {
  orbital: '0x6f72626974616c00000000000000000000000000000000000000000000000000',
  research: '0x7265736561726368000000000000000000000000000000000000000000000000',
  governance: '0x676f7665726e616e636500000000000000000000000000000000000000000000',
} as const;
