import { expect } from "chai";
import { artifacts, ethers, network } from "hardhat";
import agialpha from "../../../config/agialpha.json";

describe("Sovereign Mesh demo", () => {
  async function setTokenCode() {
    const artifact = await artifacts.readArtifact("contracts/test/MockERC20.sol:MockERC20");
    await network.provider.send("hardhat_setCode", [agialpha.address, artifact.deployedBytecode]);
  }

  it("creates jobs across two hubs", async () => {
    await setTokenCode();
    const token = await ethers.getContractAt("contracts/test/MockERC20.sol:MockERC20", agialpha.address);
    const [employer] = await ethers.getSigners();
    await token.mint(employer.address, ethers.parseEther("10"));

    const Registry = await ethers.getContractFactory("contracts/test/SimpleJobRegistry.sol:SimpleJobRegistry");
    const hubA = await Registry.deploy(await token.getAddress());
    await hubA.waitForDeployment();
    const hubB = await Registry.deploy(await token.getAddress());
    await hubB.waitForDeployment();

    const reward = ethers.parseEther("1");
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    const specA = ethers.id("hub-a-mission");
    const specB = ethers.id("hub-b-mission");

    await token.connect(employer).approve(await hubA.getAddress(), reward);
    await hubA.connect(employer).createJob(reward, deadline, specA, "ipfs://mesh/a");
    await token.connect(employer).approve(await hubB.getAddress(), reward);
    await hubB.connect(employer).createJob(reward, deadline, specB, "ipfs://mesh/b");

    const jobA = await hubA.job(1);
    const jobB = await hubB.job(1);
    expect(jobA.employer).to.equal(employer.address);
    expect(jobB.employer).to.equal(employer.address);
    expect(jobA.reward).to.equal(reward);
    expect(jobB.reward).to.equal(reward);
  });
});
