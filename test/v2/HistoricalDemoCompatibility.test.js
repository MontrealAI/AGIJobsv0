const { expect } = require('chai');
const { artifacts, ethers } = require('hardhat');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { AGIALPHA } = require('../../scripts/constants');
const historicalToken = require('../../scripts/v2/lib/agialphaToken.json');
const {
  deployPrebuiltImplementations,
} = require('../../scripts/deploy/prebuilt-implementations.cjs');
const {
  assertHistoricalDemoArtifacts,
} = require('../../scripts/v2/lib/historical-demo-artifacts.cjs');
const historicalStake = require('../../scripts/v2/lib/prebuilt/StakeManager.json');
const historicalEngine = require('../../scripts/v2/lib/prebuilt/ReputationEngine.json');
const historicalRegistry = require('../../scripts/v2/lib/prebuilt/JobRegistry.json');
const historicalDispute = require('../../scripts/v2/lib/prebuilt/DisputeModule.json');

describe('Fixed historical demo compatibility', function () {
  let snapshotId;
  before(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });
  after(async function () {
    // Do not leak the historical fixed-address token or its state to other suites.
    await ethers.provider.send('evm_revert', [snapshotId]);
  });

  it('pins the unchanged historical ABI and creation bytecode set', function () {
    expect(() =>
      assertHistoricalDemoArtifacts(
        historicalEngine,
        historicalRegistry,
        historicalDispute
      )
    ).not.to.throw();
  });

  for (const [index, name, historical] of [
    [0, 'ReputationEngine', historicalEngine],
    [1, 'JobRegistry', historicalRegistry],
    [2, 'DisputeModule', historicalDispute],
  ]) {
    for (const mutation of ['bytecode', 'abi']) {
      it(`rejects an unknown ${name} ${mutation} before deployment`, function () {
        const changed = { ...historical };
        if (mutation === 'bytecode') {
          const firstByte = Number.parseInt(changed.bytecode.slice(2, 4), 16);
          changed.bytecode = `0x${(firstByte ^ 1)
            .toString(16)
            .padStart(2, '0')}${changed.bytecode.slice(4)}`;
        } else {
          changed.abi = [...changed.abi, 'function unknownGeneration()'];
        }
        const pair = [historicalEngine, historicalRegistry, historicalDispute];
        pair[index] = changed;
        expect(() => assertHistoricalDemoArtifacts(...pair)).to.throw(
          `Unsupported ${name} artifact generation`
        );
      });
    }

    it(`rejects a current ${name}, even hidden behind the historical ABI`, async function () {
      const current = await artifacts.readArtifact(
        name === 'DisputeModule'
          ? 'contracts/v2/modules/DisputeModule.sol:DisputeModule'
          : `contracts/v2/${name}.sol:${name}`
      );
      for (const replacement of [
        current,
        { ...current, abi: historical.abi },
      ]) {
        const pair = [historicalEngine, historicalRegistry, historicalDispute];
        pair[index] = replacement;
        expect(() => assertHistoricalDemoArtifacts(...pair)).to.throw(
          `Unsupported ${name} artifact generation`
        );
      }
    });
  }

  it('deploys actual v2 contracts and grants registry/validator legacy caller access', async function () {
    const [owner, validator] = await ethers.getSigners();
    await ethers.provider.send('hardhat_setCode', [
      AGIALPHA,
      historicalToken.runtime,
    ]);
    const stake = await new ethers.ContractFactory(
      historicalStake.abi,
      historicalStake.bytecode,
      owner
    ).deploy(
      0,
      0,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address,
      await deployPrebuiltImplementations('StakeManager', owner)
    );
    const engine = await new ethers.ContractFactory(
      historicalEngine.abi,
      historicalEngine.bytecode,
      owner
    ).deploy(await stake.getAddress());
    const registry = await new ethers.ContractFactory(
      historicalRegistry.abi,
      historicalRegistry.bytecode,
      owner
    ).deploy(
      ethers.ZeroAddress,
      await stake.getAddress(),
      await engine.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address,
      await deployPrebuiltImplementations('JobRegistry', owner)
    );
    const dispute = await new ethers.ContractFactory(
      historicalDispute.abi,
      historicalDispute.bytecode,
      owner
    ).deploy(
      await registry.getAddress(),
      0,
      0,
      ethers.ZeroAddress,
      owner.address
    );
    expect(await dispute.version()).to.equal(2);
    expect(await engine.version()).to.equal(2);
    expect(await registry.version()).to.equal(2);
    expect(
      engine.interface.hasFunction('setJobRegistry(address,bool)')
    ).to.equal(false);
    const registryAddress = await registry.getAddress();
    expect(await engine.callers(registryAddress)).to.equal(false);
    await engine.connect(owner).setCaller(registryAddress, true);
    await engine.connect(owner).setCaller(validator.address, true);
    expect(await engine.callers(registryAddress)).to.equal(true);
    expect(await engine.callers(validator.address)).to.equal(true);
    const terminal = new ethers.Contract(
      await engine.getAddress(),
      ['function setJobRegistry(address,bool)'],
      owner
    );
    await expect(terminal.setJobRegistry(registryAddress, true)).to.be.reverted;
  });

  for (const script of [
    'agiLaborMarketGrandDemo.ts',
    'nationalSupplyChainGrandDemo.ts',
  ]) {
    it(`${script} guards before deploying and keeps only legacy reputation grants`, function () {
      const source = readFileSync(
        join(__dirname, '../../scripts/v2', script),
        'utf8'
      );
      const guard = source.indexOf('  assertHistoricalDemoArtifacts(');
      expect(guard).to.be.greaterThan(-1);
      expect(guard).to.be.lessThan(
        source.indexOf('  const Stake = createFactory')
      );
      expect(source).to.match(
        /logStep\(\s*'Historical prebuilt v2 demo: legacy caller grants and dispute signatures \(no v3 replay protection\)\.'/
      );
      expect(source).to.include(
        'reputation.connect(owner).setCaller(registryAddress, true)'
      );
      expect(source).to.include(
        'reputation.connect(owner).setCaller(validationAddress, true)'
      );
      expect(source).not.to.match(/reputation[\s\S]{0,80}\.setJobRegistry\(/);
      expect(source).to.include(
        'ResolveDispute(uint256 jobId,bool employerWins,address module,uint256 chainId)'
      );
      expect(source).to.include(
        "['bytes32', 'uint256', 'bool', 'address', 'uint256']"
      );
      expect(source).not.to.include('ResolveDisputeV3(');
      expect(source).not.to.include('dispute.disputeRound(');
    });
  }
});
