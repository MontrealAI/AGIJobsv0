import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import fs from 'fs';
import path from 'path';
import { ethers } from 'hardhat';
import {
  validateScenario,
  type OmegaScenario,
} from '../../demo/LARGE-SCALE-OMEGA-BUSINESS-3/orchestrator';

const scenarioPath =
  process.env.OMEGA_SCENARIO_FILE ||
  path.resolve(
    __dirname,
    '../../demo/LARGE-SCALE-OMEGA-BUSINESS-3/config/omega.simulation.json'
  );
const scenario = JSON.parse(
  fs.readFileSync(scenarioPath, 'utf8')
) as OmegaScenario;
validateScenario(scenario);

async function deployFixture() {
  const [deployer] = await ethers.getSigners();
  const Token = await ethers.getContractFactory(
    'contracts/test/MockERC20.sol:MockERC20'
  );
  const token = await Token.deploy();
  await token.waitForDeployment();
  const Registry = await ethers.getContractFactory(
    'contracts/test/SimpleJobRegistry.sol:SimpleJobRegistry'
  );
  const registry = await Registry.deploy(await token.getAddress());
  await registry.waitForDeployment();
  const wallets = new Map<string, any>();
  const actors = [
    ...scenario.nations,
    ...scenario.validators,
    scenario.treasury,
  ];
  const largest = scenario.nations.reduce(
    (value, n) =>
      BigInt(n.rewardTokens) > value ? BigInt(n.rewardTokens) : value,
    0n
  );
  const seedBalance = ethers.parseUnits((largest + 250000n).toString(), 18);
  for (let index = 0; index < actors.length; index++) {
    // Public deterministic keys are for this disposable Hardhat fixture only.
    const wallet = new ethers.Wallet(
      ethers.keccak256(ethers.toUtf8Bytes(`omega-disposable-fixture-${index}`)),
      ethers.provider
    );
    wallets.set(actors[index].wallet, wallet);
    await (
      await deployer.sendTransaction({
        to: wallet.address,
        value: ethers.parseEther('10'),
      })
    ).wait();
    // Minting avoids the previous 1.5M allocation from the mock's 1M initial supply.
    await (await token.mint(wallet.address, seedBalance)).wait();
  }
  return { token, registry, wallets, seedBalance };
}

describe('Omega Business local mock-contract rehearsal', function () {
  this.timeout(120000);
  it('finalizes every planned job and reconciles escrow, balances and receipts', async function () {
    const { token, registry, wallets, seedBalance } = await loadFixture(
      deployFixture
    );
    const registryAddress = await registry.getAddress();
    const receipts: any[] = [];
    const expected = new Map<string, bigint>(
      [...wallets.entries()].map(([key]) => [key, seedBalance])
    );
    for (const [index, nation] of scenario.nations.entries()) {
      const agentNation =
        scenario.nations[(index + 1) % scenario.nations.length];
      const employer = wallets.get(nation.wallet)!,
        agent = wallets.get(agentNation.wallet)!;
      const reward = ethers.parseUnits(nation.rewardTokens, 18);
      const latest = await ethers.provider.getBlock('latest');
      const deadline =
        BigInt(latest!.timestamp) + BigInt(nation.deadlineHours) * 3600n;
      // Commit to actual specification bytes, not a hash of an invented CID label.
      const specBytes = ethers.toUtf8Bytes(
        JSON.stringify({
          mode: 'synthetic',
          mission: nation.mission,
          reward: reward.toString(),
          deadline: deadline.toString(),
        })
      );
      const resultBytes = ethers.toUtf8Bytes(
        JSON.stringify({
          mode: 'synthetic',
          nation: nation.name,
          evidence: 'minimal mock lifecycle only',
        })
      );
      const specHash = ethers.keccak256(specBytes),
        resultHash = ethers.keccak256(resultBytes);
      const record = async (tx: any) => {
        const mined = await tx.wait();
        expect(mined.status).to.equal(1);
        receipts.push({
          hash: mined.hash,
          blockNumber: mined.blockNumber,
          status: mined.status,
        });
      };
      await record(
        await token.connect(employer).approve(registryAddress, reward)
      );
      await record(
        await registry
          .connect(employer)
          .createJob(
            reward,
            deadline,
            specHash,
            `urn:omega:fixture:spec:${index + 1}`
          )
      );
      const id = (await registry.nextJobId()) - 1n;
      expect(await token.balanceOf(registryAddress)).to.equal(reward);
      await record(
        await registry
          .connect(agent)
          .applyForJob(id, `worker0${index + 1}.agent.agi.eth`, [])
      );
      await expect(
        registry.connect(employer).finalizeJob(id, 'pending')
      ).to.be.revertedWith('not submitted');
      const outsider = wallets.get(scenario.validators[0].wallet)!;
      await expect(
        registry
          .connect(outsider)
          .submit(id, resultHash, 'urn:omega:invalid', '', [])
      ).to.be.revertedWith('not agent');
      await record(
        await registry
          .connect(agent)
          .submit(
            id,
            resultHash,
            `urn:omega:fixture:result:${index + 1}`,
            `worker0${index + 1}.agent.agi.eth`,
            []
          )
      );
      await expect(
        registry.connect(outsider).finalizeJob(id, 'invalid')
      ).to.be.revertedWith('unauthorized');
      const before = await token.balanceOf(agent.address);
      await record(
        await registry
          .connect(employer)
          .finalizeJob(id, `urn:omega:fixture:result:${index + 1}`)
      );
      expect((await token.balanceOf(agent.address)) - before).to.equal(reward);
      await expect(
        registry.connect(employer).finalizeJob(id, 'duplicate')
      ).to.be.revertedWith('finalized');
      const stored = await registry.job(id);
      expect(stored.finalized).to.equal(true);
      expect(stored.specHash).to.equal(specHash);
      expect(stored.resultHash).to.equal(resultHash);
      expect(stored.agent).to.equal(agent.address);
      expected.set(nation.wallet, expected.get(nation.wallet)! - reward);
      expected.set(
        agentNation.wallet,
        expected.get(agentNation.wallet)! + reward
      );
      expect(await token.balanceOf(registryAddress)).to.equal(0n);
    }
    for (const [key, balance] of expected)
      expect(await token.balanceOf(wallets.get(key)!.address)).to.equal(
        balance
      );
    expect(
      await token.balanceOf(wallets.get(scenario.treasury.wallet)!.address)
    ).to.equal(seedBalance);
    if (process.env.OMEGA_CONTRACT_REPORT) {
      fs.writeFileSync(
        process.env.OMEGA_CONTRACT_REPORT,
        JSON.stringify(
          {
            mode: 'local-mock-contracts',
            chainId: String((await ethers.provider.getNetwork()).chainId),
            jobsFinalized: scenario.nations.length,
            token: await token.getAddress(),
            registry: registryAddress,
            receipts,
            validatorVotingTested: false,
            ensRegistrationTested: false,
            productionApproved: false,
            settlementAsset:
              '18-decimal MockToken, not USDC or a production token',
          },
          null,
          2
        ) + '\n'
      );
    }
  });
});
