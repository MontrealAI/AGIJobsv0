import { expect } from "chai";
import { ethers } from "hardhat";

describe("GlobalGovernanceCouncil", function () {
  const nationA = ethers.id("NATION_A");
  const nationB = ethers.id("NATION_B");
  const mandateId = ethers.id("MANDATE_1");

  async function deploy() {
    const [owner] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("GlobalGovernanceCouncil");
    const contract = await factory.deploy(owner.address, ethers.id("PAUSER_ROLE"));
    await contract.waitForDeployment();
    return { contract, owner };
  }

  it("allows the owner to register and update nations", async function () {
    const { contract, owner } = await deploy();
    const governor = (await ethers.getSigners())[1];

    await expect(contract.registerNation(nationA, governor.address, 2n, "ipfs://nation-a"))
      .to.emit(contract, "NationRegistered")
      .withArgs(nationA, governor.address, 2n, "ipfs://nation-a");

    const nation = await contract.getNation(nationA);
    expect(nation.governor).to.equal(governor.address);
    expect(nation.votingWeight).to.equal(2n);
    expect(nation.active).to.equal(true);

    await expect(contract.updateNation(nationA, owner.address, 5n, false, "ipfs://updated"))
      .to.emit(contract, "NationUpdated")
      .withArgs(nationA, owner.address, 5n, false, "ipfs://updated");

    const updated = await contract.getNation(nationA);
    expect(updated.governor).to.equal(owner.address);
    expect(updated.votingWeight).to.equal(5n);
    expect(updated.active).to.equal(false);
  });

  it("blocks voting for inactive nations", async function () {
    const { contract } = await deploy();
    const [, govA] = await ethers.getSigners();

    await contract.registerNation(nationA, govA.address, 1n, "ipfs://nation");
    await contract.setNationActive(nationA, false);
    await contract.createMandate(mandateId, 1n, 0, 0, "ipfs://mandate");

    await expect(contract.connect(govA).recordNationVote(mandateId, nationA, true, "ipfs://vote"))
      .to.be.revertedWithCustomError(contract, "NationInactive");
  });

  it("records votes and recalculates weights", async function () {
    const { contract } = await deploy();
    const [, govA, govB] = await ethers.getSigners();

    await contract.registerNation(nationA, govA.address, 2n, "uri-a");
    await contract.registerNation(nationB, govB.address, 3n, "uri-b");
    await contract.createMandate(mandateId, 4n, 0, 0, "uri-m");

    await expect(contract.connect(govA).recordNationVote(mandateId, nationA, true, "uri-vote-a"))
      .to.emit(contract, "MandateVote")
      .withArgs(mandateId, nationA, true, 2n, "uri-vote-a");

    await contract.connect(govB).recordNationVote(mandateId, nationB, false, "uri-vote-b");

    let mandate = await contract.getMandate(mandateId);
    expect(mandate.supportWeight).to.equal(2n);
    expect(mandate.againstWeight).to.equal(3n);
    expect(await contract.hasMandateReachedQuorum(mandateId)).to.equal(false);

    await contract.connect(govB).recordNationVote(mandateId, nationB, true, "uri-vote-b2");
    mandate = await contract.getMandate(mandateId);
    expect(mandate.supportWeight).to.equal(5n);
    expect(mandate.againstWeight).to.equal(0n);
    expect(await contract.hasMandateReachedQuorum(mandateId)).to.equal(true);
  });

  it("enforces pause controls", async function () {
    const { contract } = await deploy();
    const [, govA] = await ethers.getSigners();
    await contract.registerNation(nationA, govA.address, 1n, "uri");
    await contract.createMandate(mandateId, 1n, 0, 0, "uri");

    await contract.pause();
    await expect(contract.connect(govA).recordNationVote(mandateId, nationA, true, "uri"))
      .to.be.revertedWith("Pausable: paused");

    await contract.unpause();
    await contract.connect(govA).recordNationVote(mandateId, nationA, true, "uri");
  });

  it("rejects duplicate nations", async function () {
    const { contract } = await deploy();
    const [, govA] = await ethers.getSigners();

    await contract.registerNation(nationA, govA.address, 1n, "uri");
    await expect(contract.registerNation(nationA, govA.address, 1n, "uri"))
      .to.be.revertedWithCustomError(contract, "NationAlreadyRegistered");
  });
});
