'use strict';
// Disposable actual-EVM integration of the ordinary writer and bounded signer.
// The TTY and documented launcher bootstrap have separate tests. This test uses
// no public provider, real wallet, explorer, fresh compilation or live funds.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const hre = require('hardhat');
const { ethers } = hre;
const { AGIALPHA } = require('../../scripts/constants');
const { main } = require('../../scripts/v2/deployDefaults.ts');
const {
  createFeeBoundedSigner,
} = require('../../scripts/deploy/tty-fee-signer.cjs');
const {
  pinFile,
  captureArtifacts,
} = require('../../scripts/deploy/tty-source.cjs');
const { inventory } = require('../../scripts/v2/lib/deployment-candidate.cjs');
const { MANAGED } = require('../../scripts/deploy/authority-audit.cjs');
const implementations = Object.values(
  require('../../config/implementation-modules.json')
).flat();
const GOVERNOR = '0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99';

describe('Conventional hidden-TTY bounded signer creation', function () {
  this.timeout(240000);
  it('executes all39 source-bound operations with exact fees and governor handover on a disposable EVM', async function () {
    assert.equal(hre.network.name, 'hardhat');
    assert.equal(Number((await ethers.provider.getNetwork()).chainId), 31337);
    assert.equal(
      (await ethers.provider.send('hardhat_metadata', [])).forkedNetwork,
      undefined
    );
    const root = path.resolve(__dirname, '../..');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-tty39-'));
    fs.mkdirSync(path.join(directory, 'locks'), { mode: 0o700 });
    const originalGetSigners = ethers.getSigners;
    const originalLock = process.env.DEPLOYMENT_LOCK_DIRECTORY;
    const all = await originalGetSigners();
    // Explicit-file Hardhat tests do not execute mocha.require root setup.
    // Prepare only this owned disposable chain's canonical test dependency.
    const mock = await hre.artifacts.readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    const beforeCode = await ethers.provider.getCode(AGIALPHA);
    assert.ok(beforeCode === '0x' || beforeCode === mock.deployedBytecode);
    if (beforeCode === '0x') {
      await assert.rejects(
        () =>
          new ethers.Contract(
            AGIALPHA,
            ['function decimals() view returns(uint8)'],
            ethers.provider
          ).decimals(),
        (error) => error.code === 'BAD_DATA' && error.value === '0x'
      );
    }
    await hre.network.provider.send('hardhat_setCode', [
      AGIALPHA,
      mock.deployedBytecode,
    ]);
    assert.equal(
      await ethers.provider.getCode(AGIALPHA),
      mock.deployedBytecode
    );
    assert.equal(
      await new ethers.Contract(
        AGIALPHA,
        ['function decimals() view returns(uint8)'],
        ethers.provider
      ).decimals(),
      18n
    );
    process.stdout.write(
      `TTY39 dependency prepared; priorCodeEmpty=${beforeCode === '0x'}\n`
    );
    const campaign = await ethers.provider.getBlock('latest');
    const config = path.join(directory, 'config.json'),
      output = path.join(directory, 'deployment.json');
    fs.writeFileSync(
      config,
      JSON.stringify({
        governance: GOVERNOR,
        campaign: {
          chainId: 31337,
          blockNumber: campaign.number,
          blockHash: campaign.hash,
        },
        authority: {
          stakeManagerTreasury: all[2].address,
          feePoolTreasury: all[2].address,
          feePoolGovernance: GOVERNOR,
        },
        tax: {
          enabled: true,
          uri: 'ipfs://bafy-disposable-tty39-policy',
          description: 'Disposable local integration policy only',
        },
        secureDefaults: { pauseOnLaunch: true },
      }),
      { mode: 0o600 }
    );
    const pins = [
      'scripts/deploy/tty-fee-signer.cjs',
      'scripts/deploy/tty-source.cjs',
      'scripts/v2/deployDefaults.ts',
      'scripts/config/index.js',
      'config/ens.json',
    ].map((file) => pinFile(path.join(root, file)));
    pins.push(pinFile(config));
    const artifactGuard = captureArtifacts(root, [
      ...inventory(),
      { name: 'MockERC20', source: 'contracts/test/MockERC20.sol' },
    ]);
    let broadcasts = 0,
      guards = 0;
    const provider = new Proxy(ethers.provider, {
      get(target, key) {
        if (key === 'broadcastTransaction')
          return async (raw) => {
            const tx = await target.broadcastTransaction(raw);
            broadcasts += 1;
            process.stdout.write(
              `TTY39 submitted ${broadcasts}/39 rss=${
                process.memoryUsage().rss
              }\n`
            );
            return tx;
          };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    // This is Hardhat's public deterministic development mnemonic only.
    const wallet = ethers.HDNodeWallet.fromPhrase(
      'test test test test test test test test test test test junk'
    ).connect(provider);
    assert.equal(wallet.address, all[0].address);
    const firstNonce = await provider.getTransactionCount(
      wallet.address,
      'latest'
    );
    const gasLimit = 16777216n,
      maxFeePerGas = 3000000000n,
      maxPriorityFeePerGas = 1000000000n;
    const signer = createFeeBoundedSigner({
      wallet,
      policy: {
        creator: wallet.address,
        chainId: 31337,
        firstNonce,
        maxTransactions: 39,
        gasLimit: String(gasLimit),
        maxFeePerGas: String(maxFeePerGas),
        maxPriorityFeePerGas: String(maxPriorityFeePerGas),
        maxTotalCost: String(39n * gasLimit * maxFeePerGas),
      },
      sourceGuard() {
        guards += 1;
        pins.forEach((pin) => pin.verify());
        artifactGuard();
        const disk = fs.statfsSync(directory);
        assert.ok(
          disk.bavail * disk.bsize >= 24 * 1024 * 1024,
          'Disposable evidence floor reached'
        );
        return true;
      },
    });
    try {
      process.env.DEPLOYMENT_LOCK_DIRECTORY = path.join(directory, 'locks');
      ethers.getSigners = async () => [signer];
      assert.equal(
        await (
          await ethers.getContractAt(
            ['function decimals() view returns(uint8)'],
            AGIALPHA
          )
        ).decimals(),
        18n
      );
      assert.equal(signer.getBudgetState().reservedTransactions, 0);
      await main(['--config', config, '--output', output, '--skip-verify']);
      const report = JSON.parse(fs.readFileSync(output, 'utf8'));
      const operations = Object.values(report.authorityOperations).sort(
        (a, b) => a.nonce - b.nonce
      );
      assert.equal(operations.length, 39);
      assert.equal(broadcasts, 39);
      assert.equal(Object.keys(report.creationRecords).length, 25);
      const receipts = new Set();
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        assert.equal(op.nonce, firstNonce + i);
        assert.equal(op.creator, wallet.address);
        assert.equal(op.receipt.status, 1);
        receipts.add(op.hash);
        const tx = await provider.getTransaction(op.hash);
        assert.equal(tx.type, 2);
        assert.equal(tx.chainId, 31337n);
        assert.equal(tx.gasLimit, gasLimit);
        assert.equal(tx.maxFeePerGas, maxFeePerGas);
        assert.equal(tx.maxPriorityFeePerGas, maxPriorityFeePerGas);
        assert.equal(tx.value, 0n);
        assert.equal(tx.from, wallet.address);
        assert.equal(ethers.keccak256(tx.data), op.dataHash);
      }
      assert.equal(receipts.size, 39);
      for (const name of ['Deployer', ...implementations]) {
        const contract = new ethers.Contract(
          report.creationRecords[name].address,
          ['function owner() view returns(address)'],
          provider
        );
        assert.equal(await contract.owner(), GOVERNOR);
      }
      const pause = new ethers.Contract(
        report.contracts.SystemPause,
        ['function owner() view returns(address)'],
        provider
      );
      assert.equal(await pause.owner(), GOVERNOR);
      for (const name of MANAGED) {
        const contract = new ethers.Contract(
          report.creationRecords[name].address,
          [
            'function owner() view returns(address)',
            'function paused() view returns(bool)',
          ],
          provider
        );
        assert.equal(await contract.owner(), report.contracts.SystemPause);
        assert.equal(await contract.paused(), true);
      }
      assert.equal(signer.getBudgetState().reservedTransactions, 39);
      assert.equal(signer.getBudgetState().halted, false);
      pins.forEach((pin) => pin.verify());
      artifactGuard();
      fs.writeFileSync(
        path.join(directory, 'acceptance.json'),
        JSON.stringify(
          {
            schema: 'jobs-tty39-local-v1',
            operations: 39,
            creations: 25,
            governorOwned: 11,
            pausedManaged: 8,
            guards,
            broadcasts,
            reportSha256: require('node:crypto')
              .createHash('sha256')
              .update(fs.readFileSync(output))
              .digest('hex'),
            productionApproved: false,
            hardwareQualified: false,
          },
          null,
          2
        ),
        { mode: 0o600 }
      );
      process.stdout.write(
        'TTY39 complete39/39; all managed modules remain paused.\n'
      );
    } finally {
      ethers.getSigners = originalGetSigners;
      if (originalLock === undefined)
        delete process.env.DEPLOYMENT_LOCK_DIRECTORY;
      else process.env.DEPLOYMENT_LOCK_DIRECTORY = originalLock;
      // Retain this finite local evidence, including any interrupted journal.
    }
  });
});
