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

  it('processes batched configuration calls atomically', async function () {
    const moduleAddress = await target.getAddress();
    const firstValue = 99n;
    const secondValue = 123n;
    const firstCall = {
      target: moduleAddress,
      callData: target.interface.encodeFunctionData('setValue', [firstValue]),
      moduleKey: MODULE_KEY,
      parameterKey: PARAMETER_KEY,
      oldValue: abiCoder.encode(['uint256'], [0n]),
      newValue: abiCoder.encode(['uint256'], [firstValue]),
      value: 0n,
    };
    const secondCall = {
      target: moduleAddress,
      callData: target.interface.encodeFunctionData('setValue', [secondValue]),
      moduleKey: MODULE_KEY,
      parameterKey: PARAMETER_KEY,
      oldValue: abiCoder.encode(['uint256'], [firstValue]),
      newValue: abiCoder.encode(['uint256'], [secondValue]),
      value: 0n,
    };

    const tx = await configurator
      .connect(owner)
      .configureBatch([firstCall, secondCall]);

    await expect(tx)
      .to.emit(configurator, 'ParameterUpdated')
      .withArgs(
        MODULE_KEY,
        PARAMETER_KEY,
        firstCall.oldValue,
        firstCall.newValue,
        owner.address
      )
      .and.to.emit(configurator, 'ParameterUpdated')
      .withArgs(
        MODULE_KEY,
        PARAMETER_KEY,
        secondCall.oldValue,
        secondCall.newValue,
        owner.address
      );

    const batchResult = await configurator
      .connect(owner)
      .configureBatch.staticCall([firstCall, secondCall]);

    expect(batchResult).to.deep.equal(['0x', '0x']);
    expect(await target.currentValue()).to.equal(secondValue);
    expect(await target.lastCaller()).to.equal(await configurator.getAddress());
  });

  it('reverts a batch when any call targets the zero address', async function () {
    const callData = target.interface.encodeFunctionData('setValue', [1n]);

    await expect(
      configurator
        .connect(owner)
        .configureBatch([
          {
            target: ethers.ZeroAddress,
            callData,
            moduleKey: MODULE_KEY,
            parameterKey: PARAMETER_KEY,
            oldValue: '0x',
            newValue: '0x',
            value: 0n,
          },
        ])
    ).to.be.revertedWithCustomError(
      configurator,
      'OwnerConfigurator__ZeroTarget'
    );
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

  it('forwards msg.value to payable configurables', async function () {
    const moduleAddress = await target.getAddress();
    const newValue = 21n;
    const minimum = ethers.parseEther('0.1');
    const callData = target.interface.encodeFunctionData('setValueWithDeposit', [
      newValue,
      minimum,
    ]);
    const newValueBytes = abiCoder.encode(['uint256'], [newValue]);

    await expect(
      configurator
        .connect(owner)
        .configure(
          moduleAddress,
          callData,
          MODULE_KEY,
          PARAMETER_KEY,
          '0x',
          newValueBytes
        )
    ).to.be.revertedWithCustomError(target, 'MissingValue');

    const tx = await configurator
      .connect(owner)
      .configure(
        moduleAddress,
        callData,
        MODULE_KEY,
        PARAMETER_KEY,
        '0x',
        newValueBytes,
        { value: minimum }
      );

    await expect(tx)
      .to.emit(target, 'ValueChangedWithDeposit')
      .withArgs(0n, newValue, minimum, await configurator.getAddress());

    expect(await ethers.provider.getBalance(await configurator.getAddress())).to.equal(0n);
    expect(await target.currentValue()).to.equal(newValue);
    expect(await target.totalReceived()).to.equal(minimum);
  });

  it('requires batch msg.value to equal declared call values', async function () {
    const moduleAddress = await target.getAddress();
    const deposit = ethers.parseEther('0.25');
    const call = {
      target: moduleAddress,
      callData: target.interface.encodeFunctionData('setValueWithDeposit', [
        9n,
        deposit,
      ]),
      moduleKey: MODULE_KEY,
      parameterKey: PARAMETER_KEY,
      oldValue: abiCoder.encode(['uint256'], [await target.currentValue()]),
      newValue: abiCoder.encode(['uint256'], [9n]),
      value: deposit,
    };

    await expect(
      configurator
        .connect(owner)
        .configureBatch([call], { value: deposit - 1n })
    )
      .to.be.revertedWithCustomError(
        configurator,
        'OwnerConfigurator__ValueMismatch'
      )
      .withArgs(deposit, deposit - 1n);

    await configurator
      .connect(owner)
      .configureBatch([call], { value: deposit });

    expect(await target.totalReceived()).to.equal(deposit);
    expect(await target.currentValue()).to.equal(9n);
  });

  it('rejects unexpected ether transfers', async function () {
    await expect(
      owner.sendTransaction({ to: await configurator.getAddress(), value: 1n })
    ).to.be.revertedWithCustomError(
      configurator,
      'OwnerConfigurator__DirectEtherRejected'
    );
  });
});
