import { ethers } from 'hardhat';

/**
 * Queues and executes ownership transfer for RewardEngineMB and Thermostat
 * through an existing TimelockController.
 *
 * Environment variables:
 *  - TIMELOCK: address of the current TimelockController
 *  - NEW_OWNER: address of the new governance timelock or multisig
 *  - REWARD_ENGINE: address of the RewardEngineMB contract
 *  - THERMOSTAT: address of the Thermostat contract
 */
async function main() {
  const [proposer] = await ethers.getSigners();

  const timelockAddr = process.env.TIMELOCK;
  const newOwner = process.env.NEW_OWNER;
  const rewardEngine = process.env.REWARD_ENGINE;
  const thermostat = process.env.THERMOSTAT;
  if (!timelockAddr || !newOwner || !rewardEngine || !thermostat) {
    throw new Error(
      'TIMELOCK, NEW_OWNER, REWARD_ENGINE and THERMOSTAT must be set'
    );
  }

  const timelock = await ethers.getContractAt(
    '@openzeppelin/contracts/governance/TimelockController.sol:TimelockController',
    timelockAddr
  );
  const iface = new ethers.Interface(['function transferOwnership(address)']);
  const targets = [rewardEngine, thermostat];
  for (const target of targets) {
    const data = iface.encodeFunctionData('transferOwnership', [newOwner]);
    await timelock
      .connect(proposer)
      .schedule(target, 0, data, ethers.ZeroHash, ethers.ZeroHash, 0);
    await timelock
      .connect(proposer)
      .execute(target, 0, data, ethers.ZeroHash, ethers.ZeroHash);
    console.log(`Ownership of ${target} transferred to ${newOwner}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
