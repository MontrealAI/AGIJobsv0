'use strict';

const { deployImplementations } = require('./implementations.cjs');

/** Deploy each component in its own transaction, then register the stack for atomic wiring. */
async function stageProtocol(deployer, ids, governance, options = {}) {
  const ethers = options.runtime || require('hardhat').ethers;
  const alreadyRegistered = await deployer.registered();
  const signer = deployer.runner;
  const coordinator = await deployer.getAddress();
  const zero = ethers.ZeroAddress;
  const overrides = options.overrides || {};
  const withTaxPolicy = options.withTaxPolicy !== false;
  const econ = options.econ || {};
  async function create(name, args, source = `contracts/v2/${name}.sol`) {
    const factory = await ethers.getContractFactory(
      `${source}:${name}`,
      signer
    );
    const componentId = ethers.id(name);
    let address = await deployer.components(componentId);
    const controller = [
      'JobRegistry',
      'StakeManager',
      'ValidationModule',
    ].includes(name);
    if (controller) {
      args.push(
        address === zero
          ? await deployImplementations(name, signer, ethers)
          : Array.from(await factory.attach(address).implementationModules())
      );
    }
    const { data } = await factory.getDeployTransaction(...args);
    if (address === zero) {
      try {
        await (
          await deployer.deployComponent(
            componentId,
            data,
            controller,
            overrides
          )
        ).wait();
      } catch (error) {
        throw new Error(
          `${name} deployment failed at coordinator ${coordinator}: ${
            error.shortMessage || error.message
          }. Keep this coordinator address to resume with the same configuration.`,
          { cause: error }
        );
      }
      address = await deployer.components(componentId);
    } else if (
      (await deployer.componentCodeHashes(componentId)) !==
      ethers.keccak256(data)
    ) {
      throw new Error(
        `Cannot resume ${name}: constructor configuration or bytecode changed`
      );
    }
    const contract = factory.attach(address);
    if (options.onDeployed)
      await options.onDeployed(name, contract, args, `${source}:${name}`);
    return contract.getAddress();
  }
  const stake = await create('StakeManager', [
    econ.minStake || 0,
    0,
    0,
    zero,
    zero,
    zero,
    coordinator,
  ]);
  const registry = await create('JobRegistry', [
    zero,
    zero,
    zero,
    zero,
    zero,
    zero,
    zero,
    0,
    0,
    [],
    coordinator,
  ]);
  const validation = await create('ValidationModule', [
    registry,
    stake,
    86400,
    86400,
    0,
    0,
    [],
  ]);
  const reputation = await create('ReputationEngine', [stake]);
  const committee = await create('ArbitratorCommittee', [registry, zero]);
  const dispute = await create(
    'DisputeModule',
    [registry, 0, 0, committee, coordinator],
    'contracts/v2/modules/DisputeModule.sol'
  );
  const certificate = await create('CertificateNFT', ['Cert', 'CERT']);
  const policy = withTaxPolicy
    ? await create('TaxPolicy', [
        'ipfs://policy',
        'All taxes on participants; contract and owner exempt',
      ])
    : zero;
  const pool = await create('FeePool', [stake, 1, zero, policy]);
  const identity = await create('IdentityRegistry', [
    ids.ens,
    ids.nameWrapper,
    reputation,
    ids.agentRootNode,
    ids.clubRootNode,
  ]);
  const platform = await create('PlatformRegistry', [stake, reputation, 0]);
  const router = await create(
    'JobRouter',
    [platform],
    'contracts/v2/modules/JobRouter.sol'
  );
  const incentives = await create('PlatformIncentives', [
    stake,
    platform,
    router,
  ]);
  const pause = await create('SystemPause', [
    registry,
    stake,
    validation,
    dispute,
    platform,
    pool,
    reputation,
    committee,
    governance,
  ]);

  const addresses = [
    stake,
    registry,
    validation,
    reputation,
    dispute,
    certificate,
    platform,
    router,
    incentives,
    pool,
    policy,
    identity,
    pause,
    committee,
  ];
  if (!alreadyRegistered) {
    await (await deployer.registerModules(addresses, overrides)).wait();
  }
  return addresses;
}

module.exports = { stageProtocol };
