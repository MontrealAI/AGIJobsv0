import { ethers } from 'hardhat';
import type { Signer } from 'ethers';
import { buildTree, computeLeaf, getProof, getRoot } from './merkle';

export interface Participant {
  signer: Signer;
  name: string;
}

export interface DemoEnvironment {
  owner: Signer;
  sentinel: Signer;
  agent: Participant;
  validators: Participant[];
  stakeManager: any;
  identityOracle: any;
  zkVerifier: any;
  demo: any;
  verifyingKey: string;
}

export async function deployEnvironment(): Promise<DemoEnvironment> {
  const [owner, sentinel, agent, v1, v2, v3, v4, v5] = await ethers.getSigners();

  const StakeManager = await ethers.getContractFactory('ConstellationStakeManager');
  const stakeManager = await StakeManager.deploy(ethers.parseEther('1'), owner.address);

  const Oracle = await ethers.getContractFactory('ENSIdentityOracle');
  const identityOracle = await Oracle.deploy();

  const verifyingKey = ethers.keccak256(ethers.toUtf8Bytes('validator-constellation-demo-key'));
  const Verifier = await ethers.getContractFactory('DemoZkBatchVerifier');
  const zkVerifier = await Verifier.deploy(verifyingKey);

  const Demo = await ethers.getContractFactory('ValidatorConstellationDemo');
  const demo = await Demo.deploy(await stakeManager.getAddress(), await identityOracle.getAddress(), await zkVerifier.getAddress());

  await stakeManager.setController(await demo.getAddress(), true);
  await demo.configureSentinel(sentinel.address, true);

  const validators: Participant[] = [
    { signer: v1, name: 'atlas.club.agi.eth' },
    { signer: v2, name: 'beluga.club.agi.eth' },
    { signer: v3, name: 'celeste.club.agi.eth' },
    { signer: v4, name: 'draco.club.agi.eth' },
    { signer: v5, name: 'elysian.club.agi.eth' },
  ];

  const validatorLeaves = validators.map((entry) => computeLeaf(entry.signer.address, entry.name));
  const validatorTree = buildTree(validatorLeaves);

  const agents: Participant[] = [{ signer: agent, name: 'astra.agent.agi.eth' }];
  const agentLeaves = agents.map((entry) => computeLeaf(entry.signer.address, entry.name));
  const agentTree = buildTree(agentLeaves);

  await identityOracle.updateMerkleRoots(getRoot(validatorTree), getRoot(agentTree), ethers.ZeroHash);

  for (let i = 0; i < validators.length; i += 1) {
    const entry = validators[i];
    await stakeManager.connect(entry.signer).depositStake(entry.signer.address, { value: ethers.parseEther('5') });
    await demo.connect(entry.signer).registerValidator(entry.name, getProof(validatorTree, i));
  }

  await demo.connect(agent).registerAgent(agents[0].name, getProof(agentTree, 0));

  return {
    owner,
    sentinel,
    agent: agents[0],
    validators,
    stakeManager,
    identityOracle,
    zkVerifier,
    demo,
    verifyingKey,
  };
}
