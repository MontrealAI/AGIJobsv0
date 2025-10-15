import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import fs from 'fs';
import path from 'path';

import { ethers } from 'hardhat';
import type { Wallet } from 'ethers';

interface NationScenario {
  name: string;
  wallet: string;
  ensSubdomain: string;
  mission: string;
  specCid: string;
  resultCid: string;
  rewardTokens: string;
  deadlineHours: number;
}

interface ValidatorScenario {
  name: string;
  wallet: string;
  ensSubdomain: string;
  mission: string;
}

interface TreasuryScenario {
  name: string;
  wallet: string;
  ensSubdomain: string;
  mission: string;
}

interface TridentScenario {
  reportLabel: string;
  ipfsGateway: string;
  ensRoot: string;
  nations: NationScenario[];
  validators: ValidatorScenario[];
  treasury: TreasuryScenario;
}

const SCENARIO_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'demo',
  'TRIDENT-SOVEREIGN-AGI-ORCHESTRATOR',
  'config',
  'trident.simulation.json'
);

const scenario = JSON.parse(fs.readFileSync(SCENARIO_PATH, 'utf8')) as TridentScenario;

async function deployFixture() {
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;

  const Token = await ethers.getContractFactory('contracts/test/MockERC20.sol:MockERC20');
  const token = await Token.deploy();
  await token.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    'contracts/test/SimpleJobRegistry.sol:SimpleJobRegistry'
  );
  const registry = await Registry.deploy(await token.getAddress());
  await registry.waitForDeployment();

  const seedBalance = ethers.parseUnits('200000', 18);
  const seedEth = ethers.parseEther('10');

  const actorWallets = new Map<string, Wallet>();

  function registerWallet(key: string): Wallet {
    if (actorWallets.has(key)) {
      return actorWallets.get(key)!;
    }
    const wallet = ethers.Wallet.createRandom().connect(provider);
    actorWallets.set(key, wallet);
    return wallet;
  }

  const allActors = [
    ...scenario.nations.map((nation) => nation.wallet),
    ...scenario.validators.map((validator) => validator.wallet),
    scenario.treasury.wallet,
  ];

  for (const label of allActors) {
    const wallet = registerWallet(label);
    await deployer.sendTransaction({ to: wallet.address, value: seedEth });
    await token.connect(deployer).transfer(wallet.address, seedBalance);
  }

  return { token, registry, actorWallets, seedBalance };
}

describe('Trident Sovereign wallet simulation', function () {
  this.timeout(120_000);

  it('routes jobs across sovereign actors with wallet-level control', async function () {
    const { token, registry, actorWallets, seedBalance } = await loadFixture(deployFixture);

    const registryAddress = await registry.getAddress();

    const employerNation = scenario.nations[0];
    const agentNation = scenario.nations[1];
    const firstEmployer = actorWallets.get(employerNation.wallet)!;
    const firstAgent = actorWallets.get(agentNation.wallet)!;

    const employerReward = ethers.parseUnits(employerNation.rewardTokens, 18);
    await token.connect(firstEmployer).approve(registryAddress, employerReward);

    const firstDeadline = BigInt(Math.floor(Date.now() / 1000)) +
      BigInt(employerNation.deadlineHours * 3600);
    const createTx = await registry
      .connect(firstEmployer)
      .createJob(
        employerReward,
        firstDeadline,
        ethers.keccak256(ethers.toUtf8Bytes(employerNation.specCid)),
        `ipfs://${employerNation.specCid}`
      );
    await createTx.wait();
    const firstJobId = (await registry.nextJobId()) - 1n;

    await registry
      .connect(firstAgent)
      .applyForJob(
        firstJobId,
        `${agentNation.ensSubdomain}.${scenario.ensRoot}`,
        '0x'
      );

    const firstResultHash = ethers.keccak256(ethers.toUtf8Bytes(employerNation.resultCid));
    await registry
      .connect(firstAgent)
      .submit(
        firstJobId,
        firstResultHash,
        `ipfs://${employerNation.resultCid}`,
        `${agentNation.ensSubdomain}.${scenario.ensRoot}`,
        '0x'
      );

    const balanceBefore = await token.balanceOf(firstAgent.address);
    await registry
      .connect(firstEmployer)
      .finalizeJob(firstJobId, `ipfs://${employerNation.resultCid}`);
    const balanceAfter = await token.balanceOf(firstAgent.address);

    expect(balanceAfter - balanceBefore).to.equal(employerReward);

    const storedFirst = await registry.job(firstJobId);
    expect(storedFirst.finalized).to.equal(true);
    expect(storedFirst.agent).to.equal(firstAgent.address);
    expect(storedFirst.resultURI).to.equal(`ipfs://${employerNation.resultCid}`);

    const reverseEmployer = actorWallets.get(agentNation.wallet)!;
    const reverseAgent = actorWallets.get(employerNation.wallet)!;
    const reverseReward = ethers.parseUnits(agentNation.rewardTokens, 18);
    await token.connect(reverseEmployer).approve(registryAddress, reverseReward);

    const secondDeadline = BigInt(Math.floor(Date.now() / 1000)) +
      BigInt(agentNation.deadlineHours * 3600);
    const secondTx = await registry
      .connect(reverseEmployer)
      .createJob(
        reverseReward,
        secondDeadline,
        ethers.keccak256(ethers.toUtf8Bytes(agentNation.specCid)),
        `ipfs://${agentNation.specCid}`
      );
    await secondTx.wait();
    const secondJobId = (await registry.nextJobId()) - 1n;

    await registry
      .connect(reverseAgent)
      .applyForJob(
        secondJobId,
        `${employerNation.ensSubdomain}.${scenario.ensRoot}`,
        '0x'
      );

    const secondResultHash = ethers.keccak256(ethers.toUtf8Bytes(agentNation.resultCid));
    await registry
      .connect(reverseAgent)
      .submit(
        secondJobId,
        secondResultHash,
        `ipfs://${agentNation.resultCid}`,
        `${employerNation.ensSubdomain}.${scenario.ensRoot}`,
        '0x'
      );

    const validatorWatcher = actorWallets.get(scenario.validators[0].wallet)!;
    await expect(
      registry
        .connect(validatorWatcher)
        .finalizeJob(secondJobId, `ipfs://${agentNation.resultCid}`)
    ).to.be.revertedWith('unauthorized');

    await registry
      .connect(reverseAgent)
      .finalizeJob(secondJobId, `ipfs://${agentNation.resultCid}`);

    const storedSecond = await registry.job(secondJobId);
    expect(storedSecond.finalized).to.equal(true);
    expect(storedSecond.resultURI).to.equal(`ipfs://${agentNation.resultCid}`);

    const treasuryWallet = actorWallets.get(scenario.treasury.wallet)!;
    const treasuryBalance = await token.balanceOf(treasuryWallet.address);
    expect(treasuryBalance).to.equal(seedBalance);
  });
});
