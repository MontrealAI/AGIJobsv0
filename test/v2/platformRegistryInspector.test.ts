import { expect } from 'chai';
import { ethers } from 'hardhat';
import { collectPlatformRegistryState } from '../../scripts/v2/lib/platformRegistryInspector';

describe('PlatformRegistry inspector', function () {
  it('collects registrar and blacklist state with event metadata', async function () {
    const [owner, registrarA, registrarB, operator] = await ethers.getSigners();

    const PlatformRegistry = await ethers.getContractFactory(
      'contracts/v2/PlatformRegistry.sol:PlatformRegistry'
    );
    const registry = await PlatformRegistry.connect(owner).deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0
    );
    await registry.waitForDeployment();

    const registrarAAddress = await registrarA.getAddress();
    const registrarBAddress = await registrarB.getAddress();
    const operatorAddress = await operator.getAddress();

    const regATx = await registry.connect(owner).setRegistrar(registrarAAddress, true);
    const regATxReceipt = await regATx.wait();

    const regBTx = await registry.connect(owner).setRegistrar(registrarBAddress, true);
    await regBTx.wait();
    const regBTxRevoke = await registry
      .connect(owner)
      .setRegistrar(registrarBAddress, false);
    const regBTxRevokeReceipt = await regBTxRevoke.wait();

    const blacklistAddTx = await registry
      .connect(owner)
      .setBlacklist(operatorAddress, true);
    await blacklistAddTx.wait();
    const blacklistClearTx = await registry
      .connect(owner)
      .setBlacklist(operatorAddress, false);
    const blacklistClearReceipt = await blacklistClearTx.wait();

    const topic = registry.interface.getEvent('RegistrarUpdated').topicHash;
    const logs = await ethers.provider.getLogs({
      address: await registry.getAddress(),
      topics: [topic],
      fromBlock: 0,
      toBlock: 'latest',
    });
    expect(logs.length).to.be.greaterThan(0);

    const state = await collectPlatformRegistryState({
      platformRegistry: registry,
    });

    expect(state.owner).to.equal(await owner.getAddress());
    expect(state.stakeManager).to.equal(ethers.ZeroAddress);
    expect(state.reputationEngine).to.equal(ethers.ZeroAddress);
    expect(state.pauser).to.equal(null);
    expect(state.minPlatformStake).to.equal(ethers.parseUnits('1', 18));

    const registrarAEntry = state.registrars.get(registrarAAddress);
    expect(registrarAEntry).to.not.be.undefined;
    expect(registrarAEntry?.value).to.equal(true);
    expect(registrarAEntry?.lastUpdatedBlock).to.equal(
      regATxReceipt?.blockNumber ?? null
    );
    expect(registrarAEntry?.transactionHash).to.equal(regATx.hash);

    const registrarBEntry = state.registrars.get(registrarBAddress);
    expect(registrarBEntry).to.not.be.undefined;
    expect(registrarBEntry?.value).to.equal(false);
    expect(registrarBEntry?.lastUpdatedBlock).to.equal(
      regBTxRevokeReceipt?.blockNumber ?? null
    );
    expect(registrarBEntry?.transactionHash).to.equal(regBTxRevoke.hash);

    const operatorEntry = state.blacklist.get(operatorAddress);
    expect(operatorEntry).to.not.be.undefined;
    expect(operatorEntry?.value).to.equal(false);
    expect(operatorEntry?.lastUpdatedBlock).to.equal(
      blacklistClearReceipt?.blockNumber ?? null
    );
    expect(operatorEntry?.transactionHash).to.equal(blacklistClearTx.hash);

    expect(state.metadata.registrarEvents).to.equal(3);
    expect(state.metadata.blacklistEvents).to.equal(2);
  });
});
