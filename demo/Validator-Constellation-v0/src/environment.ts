import type { Signer } from 'ethers';
import { buildTree, computeLeaf, getProof, getRoot } from './merkle';
import { ethers } from './runtime';

export interface Participant {
  signer: Signer;
  name: string;
  address: string;
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
  const [owner, sentinel, agentSigner, v1, v2, v3, v4, v5] = await ethers.getSigners();

  const ownerAddress = await owner.getAddress();
  const sentinelAddress = await sentinel.getAddress();
  const agentAddress = await agentSigner.getAddress();

  const StakeManager = await ethers.getContractFactory('ConstellationStakeManager');
  const stakeManager = (await StakeManager.deploy(ethers.parseEther('1'), ownerAddress)) as any;

  const Oracle = await ethers.getContractFactory('ENSIdentityOracle');
  const identityOracle = (await Oracle.deploy()) as any;

  const verifyingKey = ethers.keccak256(ethers.toUtf8Bytes('validator-constellation-demo-key'));
  const Verifier = await ethers.getContractFactory('DemoZkBatchVerifier');
  const zkVerifier = (await Verifier.deploy(verifyingKey)) as any;

  const Demo = await ethers.getContractFactory('ValidatorConstellationDemo');
  const demo = (await Demo.deploy(
    await stakeManager.getAddress(),
    await identityOracle.getAddress(),
    await zkVerifier.getAddress(),
  )) as any;

  await stakeManager.setController(await demo.getAddress(), true);
  await demo.configureSentinel(sentinelAddress, true);

  const validatorSigners: Array<{ signer: Signer; name: string }> = [
    { signer: v1, name: 'atlas.club.agi.eth' },
    { signer: v2, name: 'beluga.club.agi.eth' },
    { signer: v3, name: 'celeste.club.agi.eth' },
    { signer: v4, name: 'draco.club.agi.eth' },
    { signer: v5, name: 'elysian.club.agi.eth' },
  ];

  const validators: Participant[] = await Promise.all(
    validatorSigners.map(async ({ signer, name }) => ({
      signer,
      name,
      address: await signer.getAddress(),
    })),
  );

  const validatorLeaves = validators.map((entry) => computeLeaf(entry.address, entry.name));
  const validatorTree = buildTree(validatorLeaves);

  const agents: Participant[] = [
    {
      signer: agentSigner,
      name: 'astra.agent.agi.eth',
      address: agentAddress,
    },
  ];
  const agentLeaves = agents.map((entry) => computeLeaf(entry.address, entry.name));
  const agentTree = buildTree(agentLeaves);

  await identityOracle.updateMerkleRoots(getRoot(validatorTree), getRoot(agentTree), ethers.ZeroHash);

  for (let i = 0; i < validators.length; i += 1) {
    const entry = validators[i];
    await stakeManager.connect(entry.signer).depositStake(entry.address, { value: ethers.parseEther('5') });
    await demo.connect(entry.signer).registerValidator(entry.name, getProof(validatorTree, i));
  }

  await demo.connect(agentSigner).registerAgent(agents[0].name, getProof(agentTree, 0));

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
