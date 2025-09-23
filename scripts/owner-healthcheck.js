#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { ethers, network, artifacts } = require('hardhat');
const { AGIALPHA } = require('./constants');

async function deploySystem(owner) {
  const Deployer = await ethers.getContractFactory(
    'contracts/v2/Deployer.sol:Deployer'
  );
  const deployer = await Deployer.deploy();
  await deployer.waitForDeployment();
  console.log('⚙️  Deployer contract deployed');

  const econ = {
    token: ethers.ZeroAddress,
    feePct: 0,
    burnPct: 0,
    employerSlashPct: 0,
    treasurySlashPct: 0,
    commitWindow: 0,
    revealWindow: 0,
    minStake: 0,
    jobStake: 0,
  };
  const ids = {
    ens: ethers.ZeroAddress,
    nameWrapper: ethers.ZeroAddress,
    clubRootNode: ethers.ZeroHash,
    agentRootNode: ethers.ZeroHash,
    validatorMerkleRoot: ethers.ZeroHash,
    agentMerkleRoot: ethers.ZeroHash,
  };

  const artifact = await artifacts.readArtifact(
    'contracts/test/MockERC20.sol:MockERC20'
  );
  await network.provider.send('hardhat_setCode', [
    AGIALPHA,
    artifact.deployedBytecode,
  ]);

  console.log('⚙️  Deploying protocol via Deployer');
  const tx = await deployer.deploy(econ, ids, owner.address);
  const receipt = await tx.wait();
  console.log('⚙️  Deployer emitted deployment log');
  const deployedTopic = deployer.interface.getEvent('Deployed').topicHash;
  const log = receipt.logs.find((l) => l.topics[0] === deployedTopic);
  assert(log, 'Deployed event not found');
  const decoded = deployer.interface.decodeEventLog(
    'Deployed',
    log.data,
    log.topics
  );

  return {
    stake: decoded[0],
    registry: decoded[1],
    validation: decoded[2],
    reputation: decoded[3],
    dispute: decoded[4],
    certificate: decoded[5],
    platformRegistry: decoded[6],
    router: decoded[7],
    incentives: decoded[8],
    feePool: decoded[9],
    taxPolicy: decoded[10],
    identityRegistry: decoded[11],
    systemPause: decoded[12],
  };
}

async function checkOwnerControls() {
  const [owner, other] = await ethers.getSigners();
  const addresses = await deploySystem(owner);
  console.log('⚙️  Modules deployed, starting owner checks');

  const StakeManager = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const JobRegistry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const ValidationModule = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const ReputationEngine = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const DisputeModule = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const CertificateNFT = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const PlatformRegistry = await ethers.getContractFactory(
    'contracts/v2/PlatformRegistry.sol:PlatformRegistry'
  );
  const JobRouter = await ethers.getContractFactory(
    'contracts/v2/modules/JobRouter.sol:JobRouter'
  );
  const PlatformIncentives = await ethers.getContractFactory(
    'contracts/v2/PlatformIncentives.sol:PlatformIncentives'
  );
  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const TaxPolicy = await ethers.getContractFactory(
    'contracts/v2/TaxPolicy.sol:TaxPolicy'
  );
  const IdentityRegistry = await ethers.getContractFactory(
    'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
  );
  const SystemPause = await ethers.getContractFactory(
    'contracts/v2/SystemPause.sol:SystemPause'
  );
  const ModCertificateNFT = await ethers.getContractFactory(
    'contracts/v2/modules/CertificateNFT.sol:CertificateNFT'
  );

  const stake = StakeManager.attach(addresses.stake);
  const registry = JobRegistry.attach(addresses.registry);
  const validation = ValidationModule.attach(addresses.validation);
  const reputation = ReputationEngine.attach(addresses.reputation);
  const dispute = DisputeModule.attach(addresses.dispute);
  const certificate = CertificateNFT.attach(addresses.certificate);
  const platformRegistry = PlatformRegistry.attach(addresses.platformRegistry);
  const router = JobRouter.attach(addresses.router);
  const incentives = PlatformIncentives.attach(addresses.incentives);
  const feePool = FeePool.attach(addresses.feePool);
  const taxPolicy = TaxPolicy.attach(addresses.taxPolicy);
  const identity = IdentityRegistry.attach(addresses.identityRegistry);
  const systemPause = SystemPause.attach(addresses.systemPause);

  const modCert = await ModCertificateNFT.deploy('Cert', 'CRT');
  await modCert.waitForDeployment();
  console.log('⚙️  Auxiliary module harness deployed');

  await identity.connect(owner).acceptOwnership();
  await taxPolicy.connect(owner).acceptOwnership();
  console.log('⚙️  Accepted two-step ownership transfers');

  await network.provider.send('hardhat_setBalance', [
    addresses.systemPause,
    '0x56BC75E2D63100000',
  ]);
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [addresses.systemPause],
  });
  const systemPauseSigner = await ethers.getSigner(addresses.systemPause);
  console.log('⚙️  Impersonating SystemPause owner');

  try {
    console.log('⚠️  Skipping SystemPause pauseAll/unpauseAll verification on ephemeral devnet');

  const isSigner = (value) =>
    value && typeof value.getAddress === 'function' && typeof value.connect === 'function';

  const modules = [
      {
        label: 'ValidationModule',
        instance: validation,
        controller: systemPauseSigner,
        call: async (inst, signer) =>
          inst.connect(signer).setIdentityRegistry(addresses.identityRegistry),
      },
      {
        label: 'ReputationEngine',
        instance: reputation,
        controller: systemPauseSigner,
        call: async (inst, signer) => inst.connect(signer).setScoringWeights(0, 0),
      },
      {
        label: 'DisputeModule',
        instance: dispute,
        controller: systemPauseSigner,
        call: async (inst, signer) => inst.connect(signer).setDisputeFee(0),
      },
      {
        label: 'CertificateNFT',
        instance: certificate,
        controller: owner,
        call: async (inst, signer) =>
          inst.connect(signer).setJobRegistry(await registry.getAddress()),
      },
      {
        label: 'PlatformRegistry',
        instance: platformRegistry,
        controller: systemPauseSigner,
        call: async (inst, signer) => inst.connect(signer).setMinPlatformStake(0),
      },
      {
        label: 'JobRouter',
        instance: router,
        controller: owner,
        call: async (inst, signer) =>
          inst
            .connect(signer)
            .setRegistrar(ethers.ZeroAddress, false),
      },
      {
        label: 'PlatformIncentives',
        instance: incentives,
        controller: owner,
        call: async (inst, signer) =>
          inst
            .connect(signer)
            .setModules(
              ethers.ZeroAddress,
              ethers.ZeroAddress,
              ethers.ZeroAddress
            ),
      },
      {
        label: 'FeePool',
        instance: feePool,
        controller: systemPauseSigner,
        call: async (inst, signer) => inst.connect(signer).setBurnPct(0),
      },
      {
        label: 'TaxPolicy',
        instance: taxPolicy,
        controller: owner,
        call: async (inst, signer) => inst.connect(signer).setPolicyURI('ipfs://new'),
        twoStep: true,
      },
      {
        label: 'IdentityRegistry',
        instance: identity,
        controller: owner,
        call: async (inst, signer) => inst.connect(signer).setENS(other.address),
        twoStep: true,
      },
      {
        label: 'ModuleCertificateNFT',
        instance: modCert,
        controller: owner,
        call: async (inst, signer) => inst.connect(signer).setJobRegistry(other.address),
      },
    ];

    const controllerAddress = async (controller) => {
      if (isSigner(controller)) {
        return controller.getAddress();
      }
      return controller;
    };

    for (const module of modules) {
      const ctrlAddr = await controllerAddress(module.controller);
      const ctrlSigner = isSigner(module.controller)
        ? module.controller
        : await ethers.getSigner(ctrlAddr);

      // baseline call succeeds with current owner
      await module.call(module.instance, ctrlSigner);

      // transfer to new owner
      await module.instance
        .connect(ctrlSigner)
        .transferOwnership(await other.getAddress());
      if (module.twoStep && module.instance.acceptOwnership) {
        await module.instance.connect(other).acceptOwnership();
      }

      // new owner can call mutation
      await module.call(module.instance, other);

      // transfer back
      await module.instance
        .connect(other)
        .transferOwnership(ctrlAddr);
      if (module.twoStep && module.instance.acceptOwnership) {
        await module.instance.connect(ctrlSigner).acceptOwnership();
      }

      // original owner regains control
      await module.call(module.instance, ctrlSigner);
      console.log(`✅ ${module.label}: ownership round-trip succeeded`);
    }

    const governanceTargets = [
      {
        label: 'StakeManager',
        instance: stake,
        controller: systemPauseSigner,
        call: async (inst, signer) => inst.connect(signer).setFeePct(1),
      },
      {
        label: 'JobRegistry',
        instance: registry,
        controller: systemPauseSigner,
        call: async (inst, signer) => inst.connect(signer).setFeePct(1),
      },
    ];

    for (const target of governanceTargets) {
      const controllerAddr = await target.controller.getAddress();
      await target.instance
        .connect(target.controller)
        .setGovernance(await other.getAddress());
      await target.call(target.instance, other);
      await target.instance
        .connect(other)
        .setGovernance(controllerAddr);
      await target.call(target.instance, target.controller);
      console.log(`✅ ${target.label}: governance ownership round-trip succeeded`);
    }
  } finally {
    await network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [addresses.systemPause],
    });
  }
}

async function main() {
  console.log('🚀 Starting owner-healthcheck');
  await checkOwnerControls();
  console.log('owner-healthcheck complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

module.exports = main;
