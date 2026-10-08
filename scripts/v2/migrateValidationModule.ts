import { ethers } from 'hardhat';

/**
 * Finish an explicitly prepared, paused, drained EOA-governed replacement.
 * This is not a state migration or a multisig transaction composer.
 */
export async function migrateValidationModule(options: {
  installer: string;
  registry: string;
  newValidation: string;
}) {
  const [caller] = await ethers.getSigners();
  if (!caller) throw new Error('No governance signer configured');
  const callerAddress = ethers.getAddress(await caller.getAddress());
  const installerAddress = ethers.getAddress(options.installer);
  const registryAddress = ethers.getAddress(options.registry);
  const replacementAddress = ethers.getAddress(options.newValidation);
  const blockTag = await ethers.provider.getBlockNumber();
  const at = { blockTag };
  for (const address of [
    installerAddress,
    registryAddress,
    replacementAddress,
  ]) {
    if (
      address === ethers.ZeroAddress ||
      (await ethers.provider.getCode(address, blockTag)) === '0x'
    ) {
      throw new Error(`A deployed contract is required at ${address}`);
    }
  }
  const installer = await ethers.getContractAt(
    'contracts/v2/ModuleInstaller.sol:ModuleInstaller',
    installerAddress,
    caller
  );
  const registry = await ethers.getContractAt(
    'contracts/v2/JobRegistry.sol:JobRegistry',
    registryAddress,
    caller
  );
  const replacement = await ethers.getContractAt(
    'contracts/v2/ValidationModule.sol:ValidationModule',
    replacementAddress,
    caller
  );
  const oldAddress = await registry.validationModule(at);
  if (ethers.getAddress(oldAddress) === replacementAddress) {
    throw new Error(
      'Replacement must differ from the current validation module'
    );
  }
  const oldValidation = await ethers.getContractAt(
    'contracts/v2/ValidationModule.sol:ValidationModule',
    oldAddress,
    caller
  );
  const stakeAddress = await registry.stakeManager(at);
  const reputationAddress = await registry.reputationEngine(at);
  const identityAddress = await registry.identityRegistry(at);
  const stake = await ethers.getContractAt(
    'contracts/v2/StakeManager.sol:StakeManager',
    stakeAddress,
    caller
  );
  const reputation = await ethers.getContractAt(
    'contracts/v2/ReputationEngine.sol:ReputationEngine',
    reputationAddress,
    caller
  );
  const assertAddress = (actual: string, expected: string, label: string) => {
    if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
      throw new Error(
        `${label} mismatch; prepare the reviewed governance wiring before retrying`
      );
    }
  };
  assertAddress(await installer.owner(at), callerAddress, 'Installer owner');
  assertAddress(await registry.owner(at), installerAddress, 'Registry owner');
  assertAddress(
    await replacement.owner(at),
    installerAddress,
    'Replacement owner'
  );
  assertAddress(
    await oldValidation.owner(at),
    callerAddress,
    'Old validation owner'
  );
  assertAddress(await stake.owner(at), callerAddress, 'StakeManager owner');
  assertAddress(
    await reputation.owner(at),
    callerAddress,
    'ReputationEngine owner'
  );
  for (const [label, contract] of [
    ['JobRegistry', registry],
    ['old ValidationModule', oldValidation],
    ['new ValidationModule', replacement],
  ] as const) {
    if (!(await contract.paused(at)))
      throw new Error(`${label} must be paused`);
  }
  if (
    (await replacement.version(at)) !== 2n ||
    (await oldValidation.version(at)) !== 2n
  ) {
    throw new Error(
      'Only the current version-2 validation interface is supported'
    );
  }
  const checkWiring = async (overrides: { blockTag: number }) => {
    assertAddress(
      await replacement.jobRegistry(overrides),
      registryAddress,
      'Replacement JobRegistry'
    );
    assertAddress(
      await replacement.stakeManager(overrides),
      stakeAddress,
      'Replacement StakeManager'
    );
    assertAddress(
      await replacement.reputationEngine(overrides),
      reputationAddress,
      'Replacement ReputationEngine'
    );
    assertAddress(
      await replacement.identityRegistry(overrides),
      identityAddress,
      'Replacement IdentityRegistry'
    );
    assertAddress(
      await stake.jobRegistry(overrides),
      registryAddress,
      'StakeManager JobRegistry'
    );
    assertAddress(
      await stake.validationModule(overrides),
      replacementAddress,
      'StakeManager validation module'
    );
    if (!(await reputation.callers(replacementAddress, overrides))) {
      throw new Error('Replacement is not an authorized reputation caller');
    }
    if (await reputation.callers(oldAddress, overrides)) {
      throw new Error('Old validation reputation authority must be revoked');
    }
    if (await stake.validatorLockManagers(oldAddress, overrides)) {
      throw new Error('Old validation stake-lock authority must be revoked');
    }
  };
  await checkWiring(at);

  // A registry pause alone does not move rounds, commitments, or stake locks.
  // Inspect every recorded job at the same block. Unknown/read-failure states
  // abort before broadcasting instead of treating missing evidence as empty.
  const jobCount = await registry.nextJobId(at);
  for (let jobId = 1n; jobId <= jobCount; jobId += 1n) {
    const job = await registry.jobs(jobId, at);
    if (
      job.employer === ethers.ZeroAddress ||
      job.packedMetadata === undefined
    ) {
      throw new Error(`Job ${jobId} has unknown state`);
    }
    const metadata = await registry.decodeJobMetadata(job.packedMetadata, at);
    if (metadata.state !== 6n && metadata.state !== 7n) {
      throw new Error(
        `Job ${jobId} is not terminal; drain jobs before replacement`
      );
    }
    const round = await oldValidation.rounds(jobId, at);
    if (round.commitDeadline !== 0n && !round.tallied) {
      throw new Error(`Job ${jobId} still has an untallied validation round`);
    }
    for (const validator of await oldValidation.validators(jobId, at)) {
      if (
        (await oldValidation.validatorStakeLocks(jobId, validator, at)) !==
          0n ||
        (await stake.validatorModuleLockedStake(validator, at)) !== 0n
      ) {
        throw new Error(`Job ${jobId} still has validator stake locks`);
      }
    }
    if ((await replacement.rounds(jobId, at)).commitDeadline !== 0n) {
      throw new Error(`Replacement already contains a round for job ${jobId}`);
    }
  }
  await installer.replaceValidationModule.staticCall(
    registryAddress,
    replacementAddress,
    []
  );
  const tx = await installer.replaceValidationModule(
    registryAddress,
    replacementAddress,
    []
  );
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1)
    throw new Error('Replacement was not confirmed');
  const confirmed = { blockTag: receipt.blockNumber };
  assertAddress(
    await registry.validationModule(confirmed),
    replacementAddress,
    'Confirmed validation module'
  );
  assertAddress(
    await registry.owner(confirmed),
    callerAddress,
    'Returned registry ownership'
  );
  assertAddress(
    await replacement.owner(confirmed),
    callerAddress,
    'Returned replacement ownership'
  );
  if (
    !(await registry.paused(confirmed)) ||
    !(await replacement.paused(confirmed))
  ) {
    throw new Error(
      'Confirmed replacement must remain paused for operator verification'
    );
  }
  await checkWiring(confirmed);
  console.log(
    `Validation references and ownership confirmed in ${receipt.hash}. Registry and replacement remain paused; no validation state was migrated.`
  );
  return receipt;
}

async function main() {
  const {
    INSTALLER: installer,
    REGISTRY: registry,
    NEW_VALIDATION: newValidation,
  } = process.env;
  if (!installer || !registry || !newValidation) {
    throw new Error('INSTALLER, REGISTRY and NEW_VALIDATION env vars required');
  }
  await migrateValidationModule({ installer, registry, newValidation });
}

if (require.main === module)
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
