const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ThermoMath negative energy', function () {
  it('normalizes weights with negative energies', async function () {
    const Harness = await ethers.getContractFactory(
      'contracts/v2/mocks/ThermoMathHarness.sol:ThermoMathHarness'
    );
    const harness = await Harness.deploy();
    await harness.waitForDeployment();

    const E = [ethers.parseUnits('-20', 18), ethers.parseUnits('20', 18)];
    const g = [1n, 1n];
    const T = ethers.parseUnits('1', 18);
    const mu = 0n;

    const w = await harness.weights(E, g, T, mu);
    const sum = w[0] + w[1];
    const one = ethers.parseUnits('1', 18);
    const diff = sum > one ? sum - one : one - sum;
    expect(diff).to.be.lte(1n);
    expect(w[0]).to.be.gt(w[1]);
  });
});

