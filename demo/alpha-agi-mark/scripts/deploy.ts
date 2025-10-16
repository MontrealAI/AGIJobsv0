
import { ethers } from 'hardhat';

export interface DeploymentAddresses {
  owner: string;
  oracle: string;
  market: string;
  vault: string;
  novaSeed: string;
  novaSeedId: bigint;
}

export async function deployAlphaAgiMark(owner?: string): Promise<DeploymentAddresses> {
  const [deployer, fallbackOwner, ...rest] = await ethers.getSigners();
  const ownerAccount = owner ?? fallbackOwner.address;

  const oracleFactory = await ethers.getContractFactory('ValidatorRiskOracle');
  const oracle = await oracleFactory.deploy(ownerAccount, 0);
  await oracle.waitForDeployment();

  const novaSeedFactory = await ethers.getContractFactory('NovaSeedNFT');
  const novaSeed = await novaSeedFactory.deploy(ownerAccount);
  await novaSeed.waitForDeployment();

  const vaultFactory = await ethers.getContractFactory('SovereignVault');
  const vault = await vaultFactory.deploy(ownerAccount);
  await vault.waitForDeployment();

  const basePrice = ethers.parseEther('0.05');
  const slope = ethers.parseEther('0.01');
  const markFactory = await ethers.getContractFactory('AlphaAgiMark');
  const mark = await markFactory.deploy(ownerAccount, await oracle.getAddress(), basePrice, slope);
  await mark.waitForDeployment();

  const ownerSigner = await ethers.getSigner(ownerAccount);
  const mintTx = await novaSeed.connect(ownerSigner).mint(
    ownerAccount,
    'ipfs://alpha-agi-nova-seed'
  );
  const mintReceipt = await mintTx.wait();
  const mintEvent = mintReceipt?.logs.find((log) => log instanceof ethers.EventLog) as ethers.EventLog | undefined;
  const tokenId = mintEvent?.args?.tokenId ?? 1n;

  return {
    owner: ownerAccount,
    oracle: await oracle.getAddress(),
    market: await mark.getAddress(),
    vault: await vault.getAddress(),
    novaSeed: await novaSeed.getAddress(),
    novaSeedId: tokenId,
  };
}

if (require.main === module) {
  deployAlphaAgiMark()
    .then((deployment) => {
      console.log('Alpha-AGI MARK deployed');
      console.table(deployment);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
