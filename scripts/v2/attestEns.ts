import { ethers } from 'hardhat';

function usage() {
  console.log(
    'Usage: npx hardhat run scripts/v2/attestEns.ts --network <network> <subdomain> <role> <address>'
  );
  console.log('  <subdomain> - label before the role, e.g. "alice"');
  console.log('  <role>      - "agent" or "validator"');
  console.log('  <address>   - delegate address to attest');
}

async function ownerOf(node: string, ensAddr: string, wrapperAddr: string) {
  if (wrapperAddr && wrapperAddr !== ethers.ZeroAddress) {
    const wrapper = await ethers.getContractAt(
      ['function ownerOf(uint256 id) view returns (address)'],
      wrapperAddr
    );
    try {
      const owner = await wrapper.ownerOf(BigInt(node));
      if (owner !== ethers.ZeroAddress) return owner;
    } catch {}
  }
  if (ensAddr && ensAddr !== ethers.ZeroAddress) {
    const ens = await ethers.getContractAt(
      ['function owner(bytes32 node) view returns (address)'],
      ensAddr
    );
    try {
      return await ens.owner(node);
    } catch {}
  }
  return ethers.ZeroAddress;
}

async function main() {
  const [subdomain, roleInput, delegate] = process.argv.slice(2);
  if (!subdomain || !roleInput || !delegate) {
    usage();
    throw new Error('missing arguments');
  }

  const roleMap: Record<string, number> = {
    agent: 0,
    validator: 1,
    '0': 0,
    '1': 1,
  };
  const role = roleMap[roleInput.toLowerCase()];
  if (role === undefined) {
    throw new Error('role must be "agent"/"validator" or 0/1');
  }

  const registryAddr = process.env.ATTESTATION_REGISTRY;
  if (!registryAddr) throw new Error('ATTESTATION_REGISTRY env var required');
  const delegateAddr = ethers.getAddress(delegate);
  if (delegateAddr === ethers.ZeroAddress)
    throw new Error('delegate cannot be zero address');

  const att = await ethers.getContractAt(
    'contracts/v2/AttestationRegistry.sol:AttestationRegistry',
    registryAddr
  );

  const ensName = `${subdomain}.${role === 0 ? 'agent' : 'club'}.agi.eth`;
  const node = ethers.namehash(ensName);

  const [signer] = await ethers.getSigners();
  const ensAddr = await att.ens();
  const wrapperAddr = await att.nameWrapper();
  const owner = await ownerOf(node, ensAddr, wrapperAddr);
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`caller ${signer.address} does not own ${ensName}`);
  }

  const tx = await att.attest(node, role, delegateAddr);
  console.log(`tx: ${tx.hash}`);
  await tx.wait();
  console.log(
    `attested ${delegate} for ${ensName} as ${
      role === 0 ? 'Agent' : 'Validator'
    }`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
