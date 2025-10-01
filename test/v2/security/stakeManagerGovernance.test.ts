import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture, setBalance } from '@nomicfoundation/hardhat-network-helpers';
const AGIALPHA = '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA';

async function deployStakeManager() {
  const [deployer] = await ethers.getSigners();

  const Token = await ethers.getContractFactory(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
  );
  const token = await Token.deploy();
  const code = await ethers.provider.getCode(await token.getAddress());
  await ethers.provider.send('hardhat_setCode', [AGIALPHA, code]);

  const Timelock = await ethers.getContractFactory(
    '@openzeppelin/contracts/governance/TimelockController.sol:TimelockController'
  );
  const timelock = await Timelock.deploy(1, [deployer.address], [deployer.address], deployer.address);

  const Stake = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const stake = await Stake.deploy(
    ethers.parseEther('1'),
    0,
    100,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    await timelock.getAddress()
  );

  return { deployer, stake, timelock };
}

describe('StakeManager governance access control', function () {
  it('allows the timelock controller to update the minimum stake', async function () {
    const { stake, timelock } = await loadFixture(deployStakeManager);
    const timelockSigner = await ethers.getImpersonatedSigner(await timelock.getAddress());
    await setBalance(timelockSigner.address, ethers.parseEther('1'));

    const newThreshold = ethers.parseEther('5');
    await stake.connect(timelockSigner).setMinStake(newThreshold);

    expect(await stake.minStake()).to.equal(newThreshold);
  });

  it('rejects arbitrary callers attempting to tune stake thresholds', async function () {
    const { stake, timelock } = await loadFixture(deployStakeManager);
    const governanceAddress = await timelock.getAddress();

    for (let i = 0; i < 12; i++) {
      const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
      await setBalance(wallet.address, ethers.parseEther('1'));

      if (wallet.address.toLowerCase() === governanceAddress.toLowerCase()) {
        continue;
      }

      const randomThreshold = ethers.parseUnits((i + 2).toString(), 18);
      await expect(stake.connect(wallet).setMinStake(randomThreshold)).to.be.revertedWithCustomError(
        stake,
        'NotGovernance'
      );
    }
  });
});
