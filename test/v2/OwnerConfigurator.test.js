const { expect } = require('chai');
const { ethers } = require('hardhat');

const MODULE_KEY = ethers.keccak256(ethers.toUtf8Bytes('CONFIGURATOR::MOCK_MODULE'));
const PARAMETER_KEY = ethers.keccak256(ethers.toUtf8Bytes('CONFIGURATOR::SET_VALUE'));
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

describe('OwnerConfigurator', function () {
  let owner;
  let operator;
  let successor;
  let target;
  let configurator;

  beforeEach(async function () {
    [owner, operator, successor] = await ethers.getSigners();

    const ModuleMock = await ethers.getContractFactory('ConfigurableModuleMock');
    target = await ModuleMock.deploy();
    await target.waitForDeployment();

    const Configurator = await ethers.getContractFactory('OwnerConfigurator');
    configurator = await Configurator.deploy(owner.address);
    await configurator.waitForDeployment();
  });

  it('restricts configuration calls to the owner', async function () {
    const callData = target.interface.encodeFunctionData('setValue', [42n]);

    await expect(
      configurator
        .connect(operator)
        .configure(
          await target.getAddress(),
          callData,
          MODULE_KEY,
          PARAMETER_KEY,
          '0x',
          '0x'
        )
    )
      .to.be.revertedWithCustomError(configurator, 'OwnableUnauthorizedAccount')
      .withArgs(operator.address);
  });

  it('forwards calls, emits audit events, and returns returndata', async function () {
    const newValue = 1337n;
    const callData = target.interface.encodeFunctionData('setValue', [newValue]);
    const moduleAddress = await target.getAddress();
    const oldValueBytes = abiCoder.encode(['uint256'], [0n]);
    const newValueBytes = abiCoder.encode(['uint256'], [newValue]);

    const tx = await configurator
      .connect(owner)
      .configure(
        moduleAddress,
        callData,
        MODULE_KEY,
        PARAMETER_KEY,
        oldValueBytes,
        newValueBytes
      );

    await expect(tx)
      .to.emit(configurator, 'ParameterUpdated')
      .withArgs(
        MODULE_KEY,
        PARAMETER_KEY,
        oldValueBytes,
        newValueBytes,
        owner.address
      );

    expect(await target.currentValue()).to.equal(newValue);
    expect(await target.lastCaller()).to.equal(await configurator.getAddress());

    const returnData = await configurator
      .connect(owner)
      .configure.staticCall(
        moduleAddress,
        callData,
        MODULE_KEY,
        PARAMETER_KEY,
        oldValueBytes,
        newValueBytes
      );

    expect(returnData).to.equal('0x');
  });

  it('rejects zero-address targets before attempting a call', async function () {
    const callData = target.interface.encodeFunctionData('setValue', [1n]);

    await expect(
      configurator
        .connect(owner)
        .configure(
          ethers.ZeroAddress,
          callData,
          MODULE_KEY,
          PARAMETER_KEY,
          '0x',
          '0x'
        )
    ).to.be.revertedWithCustomError(
      configurator,
      'OwnerConfigurator__ZeroTarget'
    );
  });

  it('surfaces downstream revert reasons for observability', async function () {
    await target.setValue(5n);
    const callData = target.interface.encodeFunctionData('setValueGuarded', [10n, 1n]);

    await expect(
      configurator
        .connect(owner)
        .configure(
          await target.getAddress(),
          callData,
          MODULE_KEY,
          PARAMETER_KEY,
          '0x',
          '0x'
        )
    )
      .to.be.revertedWithCustomError(target, 'ValueMismatch')
      .withArgs(1n, 5n);
  });

  it('supports two-step ownership transfer before performing configuration', async function () {
    await expect(
      configurator.connect(owner).transferOwnership(successor.address)
    )
      .to.emit(configurator, 'OwnershipTransferStarted')
      .withArgs(owner.address, successor.address);

    await expect(configurator.connect(successor).acceptOwnership())
      .to.emit(configurator, 'OwnershipTransferred')
      .withArgs(owner.address, successor.address);

    const callData = target.interface.encodeFunctionData('setValue', [21n]);
    const newValueBytes = abiCoder.encode(['uint256'], [21n]);

    await expect(
      configurator
        .connect(owner)
        .configure(
          await target.getAddress(),
          callData,
          MODULE_KEY,
          PARAMETER_KEY,
          '0x',
          newValueBytes
        )
    )
      .to.be.revertedWithCustomError(configurator, 'OwnableUnauthorizedAccount')
      .withArgs(owner.address);

    await configurator
      .connect(successor)
      .configure(
        await target.getAddress(),
        callData,
        MODULE_KEY,
        PARAMETER_KEY,
        '0x',
        newValueBytes
      );

    expect(await target.currentValue()).to.equal(21n);
  });
});
