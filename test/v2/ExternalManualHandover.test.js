const { expect } = require('chai');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { ethers, artifacts, network } = require('hardhat');
const { AGIALPHA } = require('../../scripts/constants');
const {
  createAuthoritySourceReader,
} = require('../../scripts/deploy/authority-runtime.cjs');
const {
  createAuthorityHandover,
} = require('../../scripts/deploy/authority-handover.cjs');
const {
  createExternalSession,
  digest,
  OPERATION_KEYS,
} = require('../../scripts/deploy/external-session.cjs');
const {
  ExternalManualSigner,
} = require('../../scripts/deploy/external-signer.cjs');
const { stageProtocol } = require('../../scripts/deploy/stage-protocol.cjs');
const implementations = Object.values(
  require('../../config/implementation-modules.json')
).flat();

describe('External manual staged authority handover', function () {
  this.timeout(900000);
  it('roundtrips all 39 exact external envelopes on the disposable EVM and leaves the stack paused', async function () {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'jobs-external-evm-')
    );
    try {
      const [account, governor] = await ethers.getSigners();
      // Public development fixture only. Production modules never receive a key.
      const manualWallet = ethers.HDNodeWallet.fromPhrase(
        'test test test test test test test test test test test junk'
      );
      expect(manualWallet.address).to.equal(account.address);
      const token = await artifacts.readArtifact(
        'contracts/v2/mocks/LocalAgialpha.sol:LocalAgialpha'
      );
      await network.provider.send('hardhat_setCode', [
        AGIALPHA,
        token.deployedBytecode,
      ]);
      const start = await ethers.provider.getBlock('latest');
      const creationScope = {
        chainId: 31337,
        creator: account.address,
        governance: governor.address,
        campaign: {
          chainId: 31337,
          blockNumber: start.number,
          blockHash: start.hash,
        },
        initialBlock: {
          number: start.number,
          hash: start.hash,
          timestamp: start.timestamp,
        },
      };
      const locks = path.join(directory, 'locks');
      fs.mkdirSync(locks, { mode: 0o700 });
      const readSource = createAuthoritySourceReader();
      const plan = {
        schema: 'jobs-external-plan-v1',
        campaignId: '995377ac-950b-4f31-8ff4-652c4a5aeaaa',
        chainId: 31337,
        creator: account.address,
        governor: governor.address,
        sourceCommit: 'bd45f34de1c1e58986aafb4b0e5c48bc155839ca',
        sourceTree: 'a49fa5d32272555e62431363f1ffd36b84ea87be',
        compilerInputSha256: readSource('Deployer', ethers.ZeroAddress, {
          token: AGIALPHA,
        }).compilerInputSha256,
        sourceManifestHash: 'a'.repeat(64),
        configHash: ethers.id('disposable fixture config'),
        creationScopeHash: digest(creationScope),
        firstNonce: await ethers.provider.getTransactionCount(account.address),
        creatorCodeHash: ethers.keccak256('0x'),
        initialBlock: { number: start.number, hash: start.hash },
        confirmations: 1,
        expiresAt: '2099-01-01T00:00:00.000Z',
        fees: {
          gasLimit: '16777216',
          maxFeePerGas: '10000000000',
          maxPriorityFeePerGas: '1000000000',
        },
        lockDirectory: locks,
      };
      // Source closure verification itself has separate pure profile tests. Every
      // initcode/artifact/runtime here uses the actual canonical compiler reader.
      const session = createExternalSession({
        directory: path.join(directory, 'session'),
        plan,
        expectedPlanHash: digest(plan),
        revalidateSource: () => true,
        provider: ethers.provider,
      });
      await session.initialize();
      const signer = new ExternalManualSigner(ethers.provider, session),
        operations = {};
      const authority = createAuthorityHandover({
        provider: ethers.provider,
        signer,
        runtime: ethers,
        chainId: 31337,
        creator: account.address,
        governance: governor.address,
        token: AGIALPHA,
        readSource,
        operations,
        creationScope,
        checkpoint: async () => {
          const fd = fs.openSync(
            path.join(directory, 'authority.json'),
            'w',
            0o600
          );
          try {
            fs.writeFileSync(fd, JSON.stringify(operations));
            fs.fsyncSync(fd);
          } finally {
            fs.closeSync(fd);
          }
        },
      });
      let signatures = 0,
        relays = 0;
      async function manually(action) {
        for (;;) {
          try {
            await authority.reconcile();
            return await action();
          } catch (error) {
            if (error.code !== 'AWAITING_EXTERNAL_SIGNATURE') throw error;
            const status = await session.inspect();
            const pending = status.operations.find(
              (op) => op.state !== 'accepted'
            );
            expect(pending.state).to.equal('prepared');
            const { envelope } = await session.operation(pending.key);
            const handoff = await session.handoff({
              planHash: session.planHash,
              unsignedHash: envelope.unsignedHash,
              policyHash: envelope.policyHash,
            });
            expect(handoff.newSigningRequest).to.equal(true);
            signatures++;
            // The test acts as a separate manual signer/relay. No native writer
            // method invokes either signTransaction or broadcastTransaction.
            const raw = await manualWallet.signTransaction(
              envelope.transaction
            );
            const imported = await session.importSigned(raw);
            const capability = await session.authorizeRelay(
              imported.relayAcknowledgement
            );
            const tx = await ethers.provider.broadcastTransaction(
              capability.raw
            );
            relays++;
            await tx.wait();
            await session.observe();
            if (global.gc) global.gc();
            const memory = process.memoryUsage();
            console.log(
              `    external operation ${signatures}/39 observed; memory MiB ` +
                JSON.stringify(
                  Object.fromEntries(
                    Object.entries(memory).map(([key, value]) => [
                      key,
                      Math.round(value / 1048576),
                    ])
                  )
                ) +
                `; testOnlyForcedGc=${Boolean(global.gc)}`
            );
          }
        }
      }
      const deployer = await manually(() => authority.deploy('Deployer'));
      const coordinator = await deployer.getAddress();
      await manually(() =>
        authority.send(
          'commit',
          'Deployer',
          coordinator,
          deployer.interface.encodeFunctionData('commitConfiguration', [
            ethers.id('fixture config'),
          ])
        )
      );
      const identity = {
        ens: ethers.ZeroAddress,
        nameWrapper: ethers.ZeroAddress,
        agentRootNode: ethers.ZeroHash,
        clubRootNode: ethers.ZeroHash,
        validatorMerkleRoot: ethers.ZeroHash,
        agentMerkleRoot: ethers.ZeroHash,
      };
      const econ = {
        feePct: 0,
        burnPct: 0,
        employerSlashPct: 0,
        treasurySlashPct: 0,
        validatorSlashRewardPct: 0,
        commitWindow: 86400,
        revealWindow: 86400,
        minStake: 0,
        jobStakeBps: 1000,
      };
      const operatorAuthority = {
        ...authority,
        implementation: (...args) =>
          manually(() => authority.implementation(...args)),
        send: (...args) => manually(() => authority.send(...args)),
      };
      const staged = await stageProtocol(deployer, identity, governor.address, {
        runtime: ethers,
        authority: operatorAuthority,
        withTaxPolicy: true,
        econ,
      });
      await manually(() =>
        authority.send(
          'finalize',
          'Deployer',
          coordinator,
          deployer.interface.encodeFunctionData('deployPaused', [
            econ,
            identity,
            governor.address,
            true,
          ])
        )
      );
      await manually(() => authority.handover('Deployer', coordinator));
      await authority.reconcile();
      expect(signatures).to.equal(39);
      expect(relays).to.equal(39);
      expect(Object.keys(operations)).to.deep.equal(OPERATION_KEYS);
      expect(
        (await session.inspect()).operations.every(
          (op) => op.state === 'accepted'
        )
      ).to.equal(true);
      for (const name of ['Deployer', ...implementations]) {
        const contract = new ethers.Contract(
          operations[`create:${name}`].address,
          ['function owner() view returns(address)'],
          ethers.provider
        );
        expect(await contract.owner(), name).to.equal(governor.address);
      }
      for (const i of [0, 1, 2, 3, 4, 6, 9, 13]) {
        const contract = new ethers.Contract(
          staged[i],
          [
            'function owner() view returns(address)',
            'function paused() view returns(bool)',
          ],
          ethers.provider
        );
        expect(await contract.owner()).to.equal(staged[12]);
        expect(await contract.paused()).to.equal(true);
      }
      expect((await session.inspect()).activationReady).to.equal(false);
      expect(
        await ethers.provider.getTransactionCount(account.address)
      ).to.equal(plan.firstNonce + 39);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
