import { ethers } from "hardhat";

/**
 * Transfers governance of a Governable contract to a new TimelockController.
 * Environment variables:
 *  - OLD_TIMELOCK: current timelock address
 *  - NEW_TIMELOCK: new timelock address
 *  - GOVERNABLE: address of the governable contract
 */
async function main() {
  const [proposer] = await ethers.getSigners();

  const oldTimelock = process.env.OLD_TIMELOCK;
  const newTimelock = process.env.NEW_TIMELOCK;
  const governableAddr = process.env.GOVERNABLE;
  if (!oldTimelock || !newTimelock || !governableAddr) {
    throw new Error("OLD_TIMELOCK, NEW_TIMELOCK and GOVERNABLE must be set");
  }

  const timelock = await ethers.getContractAt(
    "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController",
    oldTimelock
  );
  const governable = await ethers.getContractAt(
    "contracts/v2/Governable.sol:Governable",
    governableAddr
  );

  const callData = governable.interface.encodeFunctionData("setGovernance", [
    newTimelock,
  ]);

  await timelock
    .connect(proposer)
    .schedule(governableAddr, 0, callData, ethers.ZeroHash, ethers.ZeroHash, 0);
  await timelock
    .connect(proposer)
    .execute(governableAddr, 0, callData, ethers.ZeroHash, ethers.ZeroHash);

  console.log(`Governance updated to ${newTimelock}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

