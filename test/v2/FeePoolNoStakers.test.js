const { ethers, artifacts, network } = require('hardhat');
const { expect } = require('chai');

// Path to AGIALPHA constant
const { address: AGIALPHA } = require('../../config/agialpha.json');

describe('FeePool - burn all fees when no stakers', function () {
  let token, stakeManager, feePool;

  beforeEach(async () => {
    const artifact = await artifacts.readArtifact('contracts/test/MockERC20.sol:MockERC20');
    await network.provider.send('hardhat_setCode', [AGIALPHA, artifact.deployedBytecode]);
    token = await ethers.getContractAt('contracts/test/MockERC20.sol:MockERC20', AGIALPHA);

    const StakeManager = await ethers.getContractFactory('contracts/legacy/MockV2.sol:MockStakeManager');
    stakeManager = await StakeManager.deploy();
    await stakeManager.setJobRegistry('0x0000000000000000000000000000000000000123');

    const FeePool = await ethers.getContractFactory('contracts/v2/FeePool.sol:FeePool');
    feePool = await FeePool.deploy(await stakeManager.getAddress(), 0, ethers.ZeroAddress, ethers.ZeroAddress);
  });

  it('burns entire fee when no stakers exist', async () => {
    const amount = ethers.parseEther('1');
    await token.mint(await feePool.getAddress(), amount);
    const supplyBefore = await token.totalSupply();

    const stakeManagerAddr = await stakeManager.getAddress();
    await network.provider.send('hardhat_impersonateAccount', [stakeManagerAddr]);
    await network.provider.send('hardhat_setBalance', [stakeManagerAddr, '0x1000000000000000000']);
    const stakeManagerSigner = await ethers.getSigner(stakeManagerAddr);
    await feePool.connect(stakeManagerSigner).depositFee(amount);
    await network.provider.send('hardhat_stopImpersonatingAccount', [stakeManagerAddr]);

    await feePool.distributeFees();

    const supplyAfter = await token.totalSupply();
    expect(supplyAfter).to.equal(supplyBefore - amount);
    expect(await token.balanceOf(await feePool.getAddress())).to.equal(0n);
  });
});
