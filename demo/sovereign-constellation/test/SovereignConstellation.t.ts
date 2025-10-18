import { expect } from "chai";
import { artifacts, ethers, network } from "hardhat";
import agialpha from "../../../config/agialpha.json";

describe("Sovereign Constellation demo", () => {
  async function setTokenCode() {
    const artifact = await artifacts.readArtifact("contracts/test/MockERC20.sol:MockERC20");
    await network.provider.send("hardhat_setCode", [agialpha.address, artifact.deployedBytecode]);
  }

  it("instantiates multi-hub playbook with committed rewards", async () => {
    await setTokenCode();
    const token = await ethers.getContractAt("contracts/test/MockERC20.sol:MockERC20", agialpha.address);
    const [missionDirector] = await ethers.getSigners();
    await token.mint(missionDirector.address, ethers.parseEther("50"));

    const Registry = await ethers.getContractFactory("contracts/test/SimpleJobRegistry.sol:SimpleJobRegistry");
    const helios = await Registry.deploy(await token.getAddress());
    await helios.waitForDeployment();
    const triton = await Registry.deploy(await token.getAddress());
    await triton.waitForDeployment();
    const athena = await Registry.deploy(await token.getAddress());
    await athena.waitForDeployment();

    const hubs = [
      { registry: helios, reward: ethers.parseEther("3.5"), uri: "ipfs://constellation/helios" },
      { registry: triton, reward: ethers.parseEther("4.2"), uri: "ipfs://constellation/triton" },
      { registry: athena, reward: ethers.parseEther("2.8"), uri: "ipfs://constellation/athena" }
    ];

    const deadline = Math.floor(Date.now() / 1000) + 2 * 86400;
    for (const { registry, reward, uri } of hubs) {
      await token.connect(missionDirector).approve(await registry.getAddress(), reward);
      const specHash = ethers.id(uri);
      await registry.connect(missionDirector).createJob(reward, deadline, specHash, uri);
    }

    const heliosJob = await helios.job(1);
    const tritonJob = await triton.job(1);
    const athenaJob = await athena.job(1);

    expect(heliosJob.employer).to.equal(missionDirector.address);
    expect(tritonJob.employer).to.equal(missionDirector.address);
    expect(athenaJob.employer).to.equal(missionDirector.address);
    expect(heliosJob.reward).to.equal(hubs[0].reward);
    expect(tritonJob.reward).to.equal(hubs[1].reward);
    expect(athenaJob.reward).to.equal(hubs[2].reward);

    const totalRewards = hubs.reduce((acc, item) => acc + item.reward, 0n);
    const missionBalance = await token.balanceOf(missionDirector.address);
    expect(missionBalance).to.equal(ethers.parseEther("50") - totalRewards);
  });
});
