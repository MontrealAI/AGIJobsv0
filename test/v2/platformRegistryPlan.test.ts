import { expect } from 'chai';
import { ethers } from 'hardhat';
import type { PlatformRegistryConfig } from '../../scripts/config';
import { buildPlatformRegistryPlan } from '../../scripts/v2/lib/platformRegistryPlan';

const ZERO = ethers.ZeroAddress;

describe('PlatformRegistry plan builder', function () {
  it('creates actions for mismatched configuration', async function () {
    const [owner, pauser, registrarA, registrarB, blacklistA, blacklistB] =
      await ethers.getSigners();

    const PlatformRegistry = await ethers.getContractFactory(
      'contracts/v2/PlatformRegistry.sol:PlatformRegistry'
    );
    const platformRegistry = await PlatformRegistry.deploy(ZERO, ZERO, 0);
    await platformRegistry.waitForDeployment();

    // Preserve a configured, nonzero delegated pauser manager through unrelated updates.
    await platformRegistry.setPauserManager(registrarB.address);

    // Seed existing registrar/blacklist state to exercise toggles.
    await platformRegistry.setRegistrar(registrarB.address, true);
    await platformRegistry.setBlacklist(blacklistB.address, true);

    const VersionMock = await ethers.getContractFactory(
      'contracts/v2/mocks/VersionMock.sol:VersionMock'
    );
    const stakeManager = await VersionMock.deploy(2);
    const reputationEngine = await VersionMock.deploy(2);

    const config: PlatformRegistryConfig = {
      stakeManager: await stakeManager.getAddress(),
      reputationEngine: await reputationEngine.getAddress(),
      minPlatformStakeTokens: '2',
      pauser: pauser.address,
      registrars: {
        [registrarA.address]: true,
        [registrarB.address]: false,
      },
      blacklist: {
        [blacklistA.address]: true,
        [blacklistB.address]: false,
      },
    };

    const plan = await buildPlatformRegistryPlan({
      platformRegistry,
      config,
      decimals: 18,
      symbol: 'AGIALPHA',
      ownerAddress: owner.address,
    });

    // The current planner batches all eight changes atomically rather than emitting eight transactions.
    expect(plan.actions).to.have.length(1);
    const action = plan.actions[0];
    expect(action.method).to.equal('applyConfiguration');
    const [update, registrars, blacklist] = action.args as [any, any[], any[]];
    expect(update).to.deep.equal({
      setStakeManager: true, stakeManager: await stakeManager.getAddress(),
      setReputationEngine: true, reputationEngine: await reputationEngine.getAddress(),
      setMinPlatformStake: true, minPlatformStake: ethers.parseUnits('2', 18),
      setPauser: true, pauser: pauser.address,
      setPauserManager: false, pauserManager: ZERO,
    });
    expect(registrars).to.have.deep.members([
      {registrar: registrarA.address, allowed: true},
      {registrar: registrarB.address, allowed: false},
    ]);
    expect(blacklist).to.have.deep.members([
      {operator: blacklistA.address, status: true},
      {operator: blacklistB.address, status: false},
    ]);
    const previousPauserManager = await platformRegistry.pauserManager();
    await platformRegistry.applyConfiguration(update, registrars, blacklist);
    expect(await platformRegistry.pauserManager()).to.equal(previousPauserManager);
    expect(await platformRegistry.stakeManager()).to.equal(await stakeManager.getAddress());
    expect(await platformRegistry.reputationEngine()).to.equal(await reputationEngine.getAddress());
    expect(await platformRegistry.minPlatformStake()).to.equal(ethers.parseUnits('2', 18));
    expect(await platformRegistry.pauser()).to.equal(pauser.address);
    expect(await platformRegistry.registrars(registrarA.address)).to.equal(true);
    expect(await platformRegistry.registrars(registrarB.address)).to.equal(false);
    expect(await platformRegistry.blacklist(blacklistA.address)).to.equal(true);
    expect(await platformRegistry.blacklist(blacklistB.address)).to.equal(false);
    const repeated = await buildPlatformRegistryPlan({platformRegistry,config,decimals:18,symbol:'AGIALPHA',ownerAddress:owner.address});
    expect(repeated.actions).to.have.length(0);
  });
});
