import { expect } from "chai";
import { ethers } from "hardhat";

type Hub = {
  job: any;
  val: any;
  id: any;
};

const deployHub = async (token: string): Promise<Hub> => {
  const JobRegistry = await ethers.getContractFactory(
    "contracts/test/SimpleJobRegistry.sol:SimpleJobRegistry"
  );
  const job = await JobRegistry.deploy(token);
  await job.waitForDeployment();

  const Validation = await ethers.getContractFactory(
    "contracts/test/DeterministicValidationModule.sol:DeterministicValidationModule"
  );
  const val = await Validation.deploy();
  await val.waitForDeployment();

  const VersionMock = await ethers.getContractFactory("VersionMock");
  const version = await VersionMock.deploy(2);
  await version.waitForDeployment();

  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const id = await IdentityRegistry.deploy(
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    await version.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash
  );
  await id.waitForDeployment();

  return { job, val, id };
};

const commitHash = (approve: boolean, salt: string) =>
  ethers.keccak256(ethers.solidityPacked(["bool", "bytes32"], [approve, salt]));

describe("Sovereign Mesh multi-hub lifecycle", function () {
  it("creates, validates, and finalizes jobs on two hubs", async function () {
    const [employer, agent, validator1, validator2] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("AGIALPHAToken");
    const token = await Token.deploy();
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    const hub1 = await deployHub(tokenAddress);
    const hub2 = await deployHub(tokenAddress);

    const reward = ethers.parseEther("1");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await (await token.mint(await hub1.job.getAddress(), 0)).wait();
    await (await token.mint(await hub2.job.getAddress(), 0)).wait();

    for (const wallet of [employer, agent, validator1, validator2]) {
      await (await token.mint(wallet.address, ethers.parseEther("5"))).wait();
    }

    const createJob = async (hub: Hub, label: string) => {
      await (await token.connect(employer).approve(await hub.job.getAddress(), reward)).wait();
      const specHash = ethers.id(`spec-${label}`);
      const tx = await hub.job
        .connect(employer)
        .createJob(reward, deadline, specHash, `ipfs://mesh/${label}`);
      const receipt = await tx.wait();
      const created = receipt?.logs.find((log: any) => log.fragment?.name === "JobCreated");
      return created?.args?.jobId as bigint;
    };

    const job1 = await createJob(hub1, "hub1");
    const job2 = await createJob(hub2, "hub2");

    for (const [hub, label] of [
      [hub1, "hub1"],
      [hub2, "hub2"]
    ] as const) {
      await (await hub.job.connect(agent).applyForJob(label === "hub1" ? job1 : job2, "validator", "0x")).wait();
      await (
        await hub.job
          .connect(agent)
          .submit(
            label === "hub1" ? job1 : job2,
            ethers.id(`result-${label}`),
            `ipfs://result/${label}`,
            "validator",
            "0x"
          )
      ).wait();
    }

    const salts = [ethers.id("salt1"), ethers.id("salt2")];
    const validators = [validator1, validator2];

    for (const [index, validator] of validators.entries()) {
      const salt = salts[index];
      const hash = commitHash(true, salt);
      await (await hub1.val.connect(validator).commitValidation(job1, hash, "validator", [])).wait();
      await (await hub2.val.connect(validator).commitValidation(job2, hash, "validator", [])).wait();
    }

    for (const [index, validator] of validators.entries()) {
      const salt = salts[index];
      await (
        await hub1.val
          .connect(validator)
          .revealValidation(job1, true, salt, "validator", [])
      ).wait();
      await (
        await hub2.val
          .connect(validator)
          .revealValidation(job2, true, salt, "validator", [])
      ).wait();
    }

    await (await hub1.val.finalize(job1)).wait();
    await (await hub2.val.finalize(job2)).wait();

    await (await hub1.job.connect(agent).finalizeJob(job1, "ipfs://final/hub1")).wait();
    await (await hub2.job.connect(agent).finalizeJob(job2, "ipfs://final/hub2")).wait();

    const agentBalance = await token.balanceOf(agent.address);
    expect(agentBalance).to.equal(ethers.parseEther("7"));
  });

  it("allows hub owners to retune identity registry anchors", async function () {
    const [owner, alt] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("AGIALPHAToken");
    const token = await Token.deploy();
    await token.waitForDeployment();
    const hub = await deployHub(await token.getAddress());

    const ensAddress = owner.address;
    await expect(hub.id.setENS(ensAddress)).to.not.be.reverted;
    expect(await hub.id.ens()).to.equal(ensAddress);

    const nameWrapper = alt.address;
    await expect(hub.id.setNameWrapper(nameWrapper)).to.not.be.reverted;
    expect(await hub.id.nameWrapper()).to.equal(nameWrapper);

    const VersionMock = await ethers.getContractFactory("VersionMock");
    const newVersion = await VersionMock.deploy(2);
    await newVersion.waitForDeployment();
    await expect(hub.id.setReputationEngine(await newVersion.getAddress())).to.not.be.reverted;
    expect(await hub.id.reputationEngine()).to.equal(await newVersion.getAddress());

    const AttestationRegistry = await ethers.getContractFactory("AttestationRegistry");
    const attestation = await AttestationRegistry.deploy(ethers.ZeroAddress, ethers.ZeroAddress);
    await attestation.waitForDeployment();
    await expect(hub.id.setAttestationRegistry(await attestation.getAddress())).to.not.be.reverted;
    expect(await hub.id.attestationRegistry()).to.equal(await attestation.getAddress());

    const agentRoot = ethers.id("agent-root");
    await expect(hub.id.setAgentRootNode(agentRoot)).to.not.be.reverted;
    expect(await hub.id.agentRootNode()).to.equal(agentRoot);

    const clubRoot = ethers.id("club-root");
    await expect(hub.id.setClubRootNode(clubRoot)).to.not.be.reverted;
    expect(await hub.id.clubRootNode()).to.equal(clubRoot);

    const nodeRoot = ethers.id("node-root");
    await expect(hub.id.setNodeRootNode(nodeRoot)).to.not.be.reverted;
    expect(await hub.id.nodeRootNode()).to.equal(nodeRoot);

    const agentMerkle = ethers.id("agent-merkle");
    await expect(hub.id.setAgentMerkleRoot(agentMerkle)).to.not.be.reverted;
    expect(await hub.id.agentMerkleRoot()).to.equal(agentMerkle);

    const validatorMerkle = ethers.id("validator-merkle");
    await expect(hub.id.setValidatorMerkleRoot(validatorMerkle)).to.not.be.reverted;
    expect(await hub.id.validatorMerkleRoot()).to.equal(validatorMerkle);
  });
});
