
import { ethers } from 'hardhat';
import { deployAlphaAgiMark } from './deploy';

async function main() {
  const deployment = await deployAlphaAgiMark();
  const [deployer, owner, validator1, validator2, validator3, investor1, investor2, investor3] = await ethers.getSigners();

  const oracle = await ethers.getContractAt('ValidatorRiskOracle', deployment.oracle, owner);
  const mark = await ethers.getContractAt('AlphaAgiMark', deployment.market, owner);
  const vault = await ethers.getContractAt('SovereignVault', deployment.vault, owner);

  await oracle.addValidator(validator1.address);
  await oracle.addValidator(validator2.address);
  await oracle.addValidator(validator3.address);
  await oracle.setApprovalsRequired(2);

  console.log('Validators registered.');

  await mark.setWhitelistStatus(true);
  await mark.setWhitelist(investor1.address, true);
  await mark.setWhitelist(investor2.address, true);
  await mark.setWhitelist(investor3.address, true);

  console.log('Whitelist initialised.');

  const markInvestor1 = mark.connect(investor1);
  const markInvestor2 = mark.connect(investor2);
  const markInvestor3 = mark.connect(investor3);

  await markInvestor1.buyShares(ethers.parseEther('10'), { value: ethers.parseEther('6') });
  await markInvestor2.buyShares(ethers.parseEther('6'), { value: ethers.parseEther('4') });
  await markInvestor3.buyShares(ethers.parseEther('4'), { value: ethers.parseEther('3') });

  console.log('Initial funding complete. Total supply:', ethers.formatEther(await mark.totalSupply()));
  console.log('Reserve balance:', ethers.formatEther(await mark.reserveBalance()));

  await oracle.connect(validator1).castVote(true);
  await oracle.connect(validator2).castVote(true);

  console.log('Oracle approvals reached:', await oracle.approvalsCount());

  await mark.finaliseLaunch(await vault.getAddress());

  console.log('Launch finalised. Sovereign vault balance:', ethers.formatEther(await ethers.provider.getBalance(await vault.getAddress())));

  await vault.withdraw(owner.address, await ethers.provider.getBalance(await vault.getAddress()));
  console.log('Owner retrieved funds to deploy sovereign initiative.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
