const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('HamiltonianMonitor', function () {
  let owner;
  let stranger;
  let monitor;

  beforeEach(async () => {
    [owner, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory(
      'contracts/v2/HamiltonianMonitor.sol:HamiltonianMonitor'
    );
    monitor = await Factory.deploy(5, owner.address);
  });

  async function recordSeries(series) {
    for (const entry of series) {
      await monitor.connect(owner).record(entry.d, entry.u);
    }
  }

  it('restricts window updates to governance', async () => {
    await expect(
      monitor.connect(stranger).setWindow(10, false)
    ).to.be.revertedWithCustomError(monitor, 'NotGovernance');

    await expect(
      monitor.connect(stranger).resetHistory()
    ).to.be.revertedWithCustomError(monitor, 'NotGovernance');
  });

  it('drops the oldest observations when the window shrinks', async () => {
    await recordSeries([
      { d: 10n, u: 1n },
      { d: 20n, u: 2n },
      { d: 30n, u: 3n },
      { d: 40n, u: 4n },
      { d: 50n, u: 5n },
      { d: 60n, u: 6n },
    ]);

    expect(await monitor.averageD()).to.equal(40n);
    expect(await monitor.averageU()).to.equal(4n);

    await expect(monitor.connect(owner).setWindow(3, false))
      .to.emit(monitor, 'WindowUpdated')
      .withArgs(5n, 3n, false);

    expect(await monitor.window()).to.equal(3n);
    expect(await monitor.averageD()).to.equal(50n);
    expect(await monitor.averageU()).to.equal(5n);

    const history = await monitor.history();
    expect(history[0].map((value) => value.toString())).to.deep.equal([
      '40',
      '50',
      '60',
    ]);
    expect(history[1].map((value) => value.toString())).to.deep.equal([
      '4',
      '5',
      '6',
    ]);
  });

  it('allows expanding the window without losing existing data', async () => {
    await recordSeries([
      { d: 10n, u: 1n },
      { d: 20n, u: 2n },
      { d: 30n, u: 3n },
      { d: 40n, u: 4n },
      { d: 50n, u: 5n },
    ]);

    await monitor.connect(owner).setWindow(3, false);

    await expect(monitor.connect(owner).setWindow(6, false))
      .to.emit(monitor, 'WindowUpdated')
      .withArgs(3n, 6n, false);

    await monitor.connect(owner).record(60n, 6n);
    await monitor.connect(owner).record(70n, 7n);

    const [dHistory, uHistory] = await monitor.history();
    expect(dHistory.map((value) => value.toString())).to.deep.equal([
      '30',
      '40',
      '50',
      '60',
      '70',
    ]);
    expect(uHistory.map((value) => value.toString())).to.deep.equal([
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
    expect(await monitor.window()).to.equal(6n);
  });

  it('supports resetting history independently of window size', async () => {
    await recordSeries([
      { d: 100n, u: 10n },
      { d: 200n, u: 20n },
    ]);

    await expect(monitor.connect(owner).resetHistory())
      .to.emit(monitor, 'HistoryReset')
      .withArgs(2n);

    const [dHistory, uHistory] = await monitor.history();
    expect(dHistory).to.be.empty;
    expect(uHistory).to.be.empty;
    expect(await monitor.averageD()).to.equal(0n);
    expect(await monitor.currentHamiltonian()).to.equal(0);
  });

  it('resets history when requested during a window update', async () => {
    await recordSeries([
      { d: 5n, u: 2n },
      { d: 6n, u: 3n },
      { d: 7n, u: 4n },
    ]);

    await expect(monitor.connect(owner).setWindow(8, true))
      .to.emit(monitor, 'HistoryReset')
      .withArgs(3n)
      .and.to.emit(monitor, 'WindowUpdated')
      .withArgs(5n, 8n, true);

    const [dHistory, uHistory] = await monitor.history();
    expect(dHistory).to.be.empty;
    expect(uHistory).to.be.empty;
    expect(await monitor.window()).to.equal(8n);
  });
});
