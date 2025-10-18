import fs from "fs";
import path from "path";
import { artifacts, ethers, network } from "hardhat";
import agialpha from "../../../config/agialpha.json";

type HubConfig = {
  label: string;
  chainId: number;
  networkName: string;
  rpcUrl: string;
  owner: string;
  governance: string;
  subgraphUrl: string;
  addresses: Record<string, string>;
};

async function ensureMockAgialpha() {
  const artifact = await artifacts.readArtifact("contracts/test/MockERC20.sol:MockERC20");
  await network.provider.send("hardhat_setCode", [agialpha.address, artifact.deployedBytecode]);
}

async function deployHub(
  label: string,
  governance: string,
  chainId: number,
  networkName: string,
  rpcUrl: string
): Promise<HubConfig> {
  const Deployer = await ethers.getContractFactory("contracts/v2/Deployer.sol:Deployer");
  const deployer = await Deployer.deploy();
  await deployer.waitForDeployment();

  const identity = {
    ens: ethers.ZeroAddress,
    nameWrapper: ethers.ZeroAddress,
    clubRootNode: ethers.ZeroHash,
    agentRootNode: ethers.ZeroHash,
    validatorMerkleRoot: ethers.ZeroHash,
    agentMerkleRoot: ethers.ZeroHash
  };

  const result = await deployer.deployDefaultsWithoutTaxPolicy(identity, governance);
  const [
    stakeManager,
    jobRegistry,
    validationModule,
    reputationEngine,
    disputeModule,
    certificateNFT,
    platformRegistry,
    jobRouter,
    platformIncentives,
    feePool,
    taxPolicy,
    identityRegistry,
    systemPause
  ] = result;

  return {
    label,
    chainId,
    networkName,
    rpcUrl,
    owner: governance,
    governance,
    subgraphUrl: "http://127.0.0.1:8000/subgraphs/name/agi/sovereign-constellation",
    addresses: {
      AGIALPHA: agialpha.address,
      JobRegistry: jobRegistry,
      StakeManager: stakeManager,
      ValidationModule: validationModule,
      DisputeModule: disputeModule,
      IdentityRegistry: identityRegistry,
      CertificateNFT: certificateNFT,
      FeePool: feePool,
      ReputationEngine: reputationEngine,
      PlatformRegistry: platformRegistry,
      JobRouter: jobRouter,
      PlatformIncentives: platformIncentives,
      SystemPause: systemPause,
      TaxPolicy: taxPolicy
    }
  };
}

async function main() {
  const configPath = path.join(__dirname, "../config/constellation.hubs.json");
  const [deployer] = await ethers.getSigners();
  await ensureMockAgialpha();

  const helios = await deployHub("Helios Research Hub", deployer.address, 31337, "Localnet Helios", "http://127.0.0.1:8545");
  const triton = await deployHub("Triton Industrial Hub", deployer.address, 31338, "Localnet Triton", "http://127.0.0.1:9545");
  const athena = await deployHub("Athena Governance Hub", deployer.address, 31339, "Localnet Athena", "http://127.0.0.1:10545");

  const hubs: Record<string, HubConfig> = {
    "helios-research": helios,
    "triton-industrial": triton,
    "athena-governance": athena
  };

  fs.writeFileSync(configPath, JSON.stringify(hubs, null, 2));
  console.log(`Sovereign Constellation hubs deployed and written to ${configPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
