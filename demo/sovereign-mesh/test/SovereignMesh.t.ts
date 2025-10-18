import { expect } from "chai";
import { artifacts, ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { AGIALPHA, AGIALPHA_DECIMALS } from "../../../scripts/constants";

const ownerSlot = ethers.toBeHex(5, 32);

async function installAgialpha(owner: string) {
  const artifact = await artifacts.readArtifact("contracts/test/AGIALPHAToken.sol:AGIALPHAToken");
  await ethers.provider.send("hardhat_setCode", [AGIALPHA, artifact.deployedBytecode]);
  await ethers.provider.send("hardhat_setStorageAt", [AGIALPHA, ownerSlot, ethers.zeroPadValue(owner, 32)]);
  return ethers.getContractAt("contracts/test/AGIALPHAToken.sol:AGIALPHAToken", AGIALPHA);
}

type HubEnv = {
  stake: any;
  validation: any;
  identity: any;
  registry: any;
  token: any;
  certificate: any;
};

async function deployHub(
  label: string,
  token: any,
  owner: any,
  employer: any,
  agent: any,
  validatorA: any,
  validatorB: any
): Promise<HubEnv> {
  const Stake = await ethers.getContractFactory("contracts/v2/StakeManager.sol:StakeManager");
  const stake = await Stake.deploy(
    ethers.parseUnits("1", AGIALPHA_DECIMALS),
    0,
    100,
    owner.address,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address
  );
  await stake.waitForDeployment();

  const Reputation = await ethers.getContractFactory("contracts/v2/ReputationEngine.sol:ReputationEngine");
  const reputation = await Reputation.deploy(await stake.getAddress());
  await reputation.waitForDeployment();

  const ENS = await ethers.getContractFactory("contracts/legacy/MockENS.sol:MockENS");
  const ens = await ENS.deploy();
  const Wrapper = await ethers.getContractFactory("contracts/legacy/MockNameWrapper.sol:MockNameWrapper");
  const wrapper = await Wrapper.deploy();

  const Identity = await ethers.getContractFactory("contracts/v2/IdentityRegistry.sol:IdentityRegistry");
  const identity = await Identity.deploy(
    await ens.getAddress(),
    await wrapper.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash
  );
  await identity.waitForDeployment();

  const Validation = await ethers.getContractFactory("contracts/v2/mocks/ValidationStub.sol:ValidationStub");
  const validation = await Validation.deploy();
  await validation.waitForDeployment();

  const Certificate = await ethers.getContractFactory("contracts/v2/CertificateNFT.sol:CertificateNFT");
  const certificate = await Certificate.deploy(`${label} Credential`, "SMCRED");
  await certificate.waitForDeployment();

  const Registry = await ethers.getContractFactory("contracts/v2/JobRegistry.sol:JobRegistry");
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await certificate.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    owner.address
  );
  await registry.waitForDeployment();

  const Dispute = await ethers.getContractFactory("contracts/v2/modules/DisputeModule.sol:DisputeModule");
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    owner.address,
    owner.address
  );
  await dispute.waitForDeployment();

  await stake.setJobRegistry(await registry.getAddress());
  await stake.setDisputeModule(await dispute.getAddress());
  await validation.setJobRegistry(await registry.getAddress());
  await identity.addAdditionalAgent(agent.address);
  await identity.addAdditionalValidator(validatorA.address);
  await identity.addAdditionalValidator(validatorB.address);
  await registry.setIdentityRegistry(await identity.getAddress());
  await certificate.setJobRegistry(await registry.getAddress());
  await certificate.setStakeManager(await stake.getAddress());
  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await certificate.getAddress(),
    ethers.ZeroAddress,
    []
  );
  await reputation.setAuthorizedCaller(await registry.getAddress(), true);

  return { stake, validation, identity, registry, token, certificate };
}

describe("Sovereign Mesh multi-hub orchestration", () => {
  it("runs commit/reveal finalization across two hubs", async () => {
    const [owner, employer, agent, validatorA, validatorB] = await ethers.getSigners();
    const token = await installAgialpha(owner.address);

    const initialMint = ethers.parseUnits("1000", AGIALPHA_DECIMALS);
    for (const wallet of [employer, agent, validatorA, validatorB]) {
      await token.mint(wallet.address, initialMint);
    }

    const hub1 = await deployHub("Research", token, owner, employer, agent, validatorA, validatorB);
    const hub2 = await deployHub("Ops", token, owner, employer, agent, validatorA, validatorB);

    const hubs = [hub1, hub2];
    const reward = ethers.parseUnits("100", AGIALPHA_DECIMALS);

    for (let idx = 0; idx < hubs.length; idx++) {
      const hub = hubs[idx];
      await hub.validation.setValidators([validatorA.address, validatorB.address]);
      await token.connect(employer).approve(await hub.registry.getAddress(), reward);
      const deadline = BigInt((await time.latest()) + 3600);
      const specHash = ethers.id(`spec-${idx}`);
      const jobUri = `ipfs://mesh/job/${idx}`;
      await hub.registry.connect(employer).createJob(reward, deadline, specHash, jobUri);

      const subdomain = `agent-${idx}`;
      await hub.identity.addAdditionalAgent(agent.address);
      await hub.registry.connect(agent).applyForJob(1, subdomain, []);
      const resultHash = ethers.id(`result-${idx}`);
      await hub.registry
        .connect(agent)
        .submit(1, resultHash, `ipfs://mesh/result/${idx}`, subdomain, []);

      const saltA = ethers.id(`salt-a-${idx}`);
      const saltB = ethers.id(`salt-b-${idx}`);
      const commitA = ethers.keccak256(
        ethers.solidityPacked(["bool", "bytes32"], [true, saltA])
      );
      const commitB = ethers.keccak256(
        ethers.solidityPacked(["bool", "bytes32"], [true, saltB])
      );
      await hub.validation
        .connect(validatorA)
        .commitValidation(1, commitA, "validator", []);
      await hub.validation
        .connect(validatorB)
        .commitValidation(1, commitB, "validator", []);

      await hub.validation
        .connect(validatorA)
        .revealValidation(1, true, saltA, ethers.ZeroHash, "", []);
      await hub.validation
        .connect(validatorB)
        .revealValidation(1, true, saltB, ethers.ZeroHash, "", []);

      await hub.validation.setResult(true);
      await hub.validation.finalize(1);
      await hub.registry.connect(employer).finalize(1);
    }

    const agentBalance = await token.balanceOf(agent.address);
    expect(agentBalance).to.equal(ethers.parseUnits("1200", AGIALPHA_DECIMALS));

    const employerBalance = await token.balanceOf(employer.address);
    expect(employerBalance).to.equal(ethers.parseUnits("800", AGIALPHA_DECIMALS));

    for (const hub of hubs) {
      expect(await hub.certificate.balanceOf(agent.address)).to.equal(1n);
    }
  });
});
