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

    expect(plan.actions).to.have.length(8);

    function findAction(
      method: string,
      predicate: (action: { method: string; args: unknown[] }) => boolean
    ) {
      return plan.actions.find(
        (action) => action.method === method && predicate(action)
      );
    }

    expect(
      findAction('setStakeManager', () => true),
      'setStakeManager action'
    ).to.not.equal(undefined);
    expect(
      findAction('setReputationEngine', () => true),
      'setReputationEngine action'
    ).to.not.equal(undefined);
    expect(
      findAction('setMinPlatformStake', () => true),
      'setMinPlatformStake action'
    ).to.not.equal(undefined);
    expect(
      findAction('setPauser', (action) => action.args[0] === pauser.address),
      'setPauser action'
    ).to.not.equal(undefined);
    expect(
      findAction(
        'setRegistrar',
        (action) =>
          action.args[0] === registrarA.address && action.args[1] === true
      ),
      'registrarA authorisation'
    ).to.not.equal(undefined);
    expect(
      findAction(
        'setRegistrar',
        (action) =>
          action.args[0] === registrarB.address && action.args[1] === false
      ),
      'registrarB revocation'
    ).to.not.equal(undefined);
    expect(
      findAction(
        'setBlacklist',
        (action) =>
          action.args[0] === blacklistA.address && action.args[1] === true
      ),
      'blacklistA set'
    ).to.not.equal(undefined);
    expect(
      findAction(
        'setBlacklist',
        (action) =>
          action.args[0] === blacklistB.address && action.args[1] === false
      ),
      'blacklistB removal'
    ).to.not.equal(undefined);
  });
});
