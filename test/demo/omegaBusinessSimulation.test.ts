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

interface OmegaScenario {
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
  'LARGE-SCALE-OMEGA-BUSINESS-3',
  'config',
  'omega.simulation.json'
);

const scenario = JSON.parse(fs.readFileSync(SCENARIO_PATH, 'utf8')) as OmegaScenario;

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

  const seedBalance = ethers.parseUnits('250000', 18);
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

describe('Large-Scale α-AGI Business 3 simulation', function () {
  this.timeout(120_000);

  it('routes multi-nation jobs with validator protection and treasury safety', async function () {
    const { token, registry, actorWallets, seedBalance } = await loadFixture(deployFixture);

    const registryAddress = await registry.getAddress();

    const solaria = scenario.nations[0];
    const arctic = scenario.nations[1];
    const silkRoad = scenario.nations[2];

    const solarEmployer = actorWallets.get(solaria.wallet)!;
    const solarAgent = actorWallets.get(arctic.wallet)!;

    const solarReward = ethers.parseUnits(solaria.rewardTokens, 18);
    await token.connect(solarEmployer).approve(registryAddress, solarReward);

    const solarDeadline = BigInt(Math.floor(Date.now() / 1000)) + BigInt(solaria.deadlineHours * 3600);
    const solarTx = await registry
      .connect(solarEmployer)
      .createJob(
        solarReward,
        solarDeadline,
        ethers.keccak256(ethers.toUtf8Bytes(solaria.specCid)),
        `ipfs://${solaria.specCid}`
      );
    await solarTx.wait();
    const solarJobId = (await registry.nextJobId()) - 1n;

    await registry
      .connect(solarAgent)
      .applyForJob(solarJobId, `${arctic.ensSubdomain}.${scenario.ensRoot}`, '0x');

    const solarResultHash = ethers.keccak256(ethers.toUtf8Bytes(solaria.resultCid));
    await registry
      .connect(solarAgent)
      .submit(
        solarJobId,
        solarResultHash,
        `ipfs://${solaria.resultCid}`,
        `${arctic.ensSubdomain}.${scenario.ensRoot}`,
        '0x'
      );

    const balanceBefore = await token.balanceOf(solarAgent.address);
    await registry
      .connect(solarEmployer)
      .finalizeJob(solarJobId, `ipfs://${solaria.resultCid}`);
    const balanceAfter = await token.balanceOf(solarAgent.address);

    expect(balanceAfter - balanceBefore).to.equal(solarReward);

    const storedSolar = await registry.job(solarJobId);
    expect(storedSolar.finalized).to.equal(true);
    expect(storedSolar.agent).to.equal(solarAgent.address);

    const silkEmployer = actorWallets.get(silkRoad.wallet)!;
    const silkAgent = actorWallets.get(solaria.wallet)!;
    const silkReward = ethers.parseUnits(silkRoad.rewardTokens, 18);
    await token.connect(silkEmployer).approve(registryAddress, silkReward);

    const silkDeadline = BigInt(Math.floor(Date.now() / 1000)) + BigInt(silkRoad.deadlineHours * 3600);
    const silkTx = await registry
      .connect(silkEmployer)
      .createJob(
        silkReward,
        silkDeadline,
        ethers.keccak256(ethers.toUtf8Bytes(silkRoad.specCid)),
        `ipfs://${silkRoad.specCid}`
      );
    await silkTx.wait();
    const silkJobId = (await registry.nextJobId()) - 1n;

    await registry
      .connect(silkAgent)
      .applyForJob(silkJobId, `${solaria.ensSubdomain}.${scenario.ensRoot}`, '0x');

    const validatorWallet = actorWallets.get(scenario.validators[0].wallet)!;
    await expect(
      registry
        .connect(validatorWallet)
        .finalizeJob(silkJobId, `ipfs://${silkRoad.resultCid}`)
    ).to.be.revertedWith('unauthorized');

    await registry
      .connect(silkAgent)
      .submit(
        silkJobId,
        ethers.keccak256(ethers.toUtf8Bytes(silkRoad.resultCid)),
        `ipfs://${silkRoad.resultCid}`,
        `${solaria.ensSubdomain}.${scenario.ensRoot}`,
        '0x'
      );

    await registry
      .connect(silkEmployer)
      .finalizeJob(silkJobId, `ipfs://${silkRoad.resultCid}`);

    const storedSilk = await registry.job(silkJobId);
    expect(storedSilk.finalized).to.equal(true);
    expect(storedSilk.resultURI).to.equal(`ipfs://${silkRoad.resultCid}`);

    const treasuryWallet = actorWallets.get(scenario.treasury.wallet)!;
    const treasuryBalance = await token.balanceOf(treasuryWallet.address);
    expect(treasuryBalance).to.equal(seedBalance);
  });
});
