const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Governance handover via Timelock', function () {
  it('transfers governance to a new timelock', async function () {
    const [admin] = await ethers.getSigners();

    const Timelock = await ethers.getContractFactory(
      'contracts/legacy/TimelockControllerHarness.sol:TimelockControllerHarness'
    );
    const tl1 = await Timelock.deploy(admin.address);
    await tl1.waitForDeployment();
    const tl2 = await Timelock.deploy(admin.address);
    await tl2.waitForDeployment();
    const proposerRole = await tl1.PROPOSER_ROLE();
    const executorRole = await tl1.EXECUTOR_ROLE();
    await tl1.grantRole(proposerRole, admin.address);
    await tl1.grantRole(executorRole, admin.address);
    await tl2.grantRole(proposerRole, admin.address);
    await tl2.grantRole(executorRole, admin.address);

    const Mock = await ethers.getContractFactory(
      'contracts/v2/mocks/GovernableMock.sol:GovernableMock'
    );
    const mock = await Mock.deploy(await tl1.getAddress());
    await mock.waitForDeployment();

    // only timelock1 can call privileged setters initially
    const setValueCall = mock.interface.encodeFunctionData('setValue', [1]);
    await tl1
      .connect(admin)
      .schedule(
        await mock.getAddress(),
        0,
        setValueCall,
        ethers.ZeroHash,
        ethers.ZeroHash,
        0
      );
    await tl1
      .connect(admin)
      .execute(
        await mock.getAddress(),
        0,
        setValueCall,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
    expect(await mock.value()).to.equal(1);

    // transfer governance to timelock2 via timelock1
    const setGovCall = mock.interface.encodeFunctionData('setGovernance', [
      await tl2.getAddress(),
    ]);
    await tl1
      .connect(admin)
      .schedule(
        await mock.getAddress(),
        0,
        setGovCall,
        ethers.ZeroHash,
        ethers.ZeroHash,
        0
      );
    await tl1
      .connect(admin)
      .execute(
        await mock.getAddress(),
        0,
        setGovCall,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
    expect(await mock.governance()).to.equal(await tl2.getAddress());
    expect(await mock.governanceAddress()).to.equal(await tl2.getAddress());

    // old timelock can no longer call
    const setValueCall2 = mock.interface.encodeFunctionData('setValue', [2]);
    await tl1
      .connect(admin)
      .schedule(
        await mock.getAddress(),
        0,
        setValueCall2,
        ethers.ZeroHash,
        ethers.ZeroHash,
        0
      );
    await expect(
      tl1
        .connect(admin)
        .execute(
          await mock.getAddress(),
          0,
          setValueCall2,
          ethers.ZeroHash,
          ethers.ZeroHash
        )
    ).to.be.revertedWithCustomError(mock, 'NotGovernance');

    // new timelock can call
    await tl2
      .connect(admin)
      .schedule(
        await mock.getAddress(),
        0,
        setValueCall2,
        ethers.ZeroHash,
        ethers.ZeroHash,
        0
      );
    await tl2
      .connect(admin)
      .execute(
        await mock.getAddress(),
        0,
        setValueCall2,
        ethers.ZeroHash,
        ethers.ZeroHash
      );
    expect(await mock.value()).to.equal(2);
  });
});
