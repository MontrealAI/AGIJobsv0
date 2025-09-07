import { ethers } from 'hardhat';

async function main() {
  const registryAddr = process.env.IDENTITY_REGISTRY;
  const ensAddr = process.env.ENS_REGISTRY;
  const wrapperAddr = process.env.NAME_WRAPPER;
  const agentRoot = process.env.AGENT_ROOT_NODE;
  const clubRoot = process.env.CLUB_ROOT_NODE;
  if (!registryAddr) throw new Error('IDENTITY_REGISTRY env var required');
  if (!ensAddr) throw new Error('ENS_REGISTRY env var required');
  if (!wrapperAddr) throw new Error('NAME_WRAPPER env var required');
  if (!agentRoot) throw new Error('AGENT_ROOT_NODE env var required');
  if (!clubRoot) throw new Error('CLUB_ROOT_NODE env var required');

  const identity = await ethers.getContractAt(
    'contracts/v2/IdentityRegistry.sol:IdentityRegistry',
    registryAddr
  );

  let tx = await identity.setENS(ensAddr);
  console.log(`setENS tx: ${tx.hash}`);
  await tx.wait();

  tx = await identity.setNameWrapper(wrapperAddr);
  console.log(`setNameWrapper tx: ${tx.hash}`);
  await tx.wait();

  tx = await identity.setAgentRootNode(agentRoot);
  console.log(`setAgentRootNode tx: ${tx.hash}`);
  await tx.wait();

  tx = await identity.setClubRootNode(clubRoot);
  console.log(`setClubRootNode tx: ${tx.hash}`);
  await tx.wait();

  console.log('IdentityRegistry ENS configuration complete');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
