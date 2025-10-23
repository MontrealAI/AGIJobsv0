import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

async function deploy(name: string, ...args: unknown[]) {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

describe("Phase8UniversalValueManager", function () {
  it("keeps governance in full control of domains, sentinels and capital streams", async function () {
    const [deployer, governance, operator, treasury, vault, validator, policy, sentinelAgent, streamVault] =
      await ethers.getSigners();

    const manager = await deploy("Phase8UniversalValueManager", governance.address);
    const pauseHarness = await deploy("Phase6MockSystemPause");

    const globalParams = {
      treasury: treasury.address,
      universalVault: vault.address,
      upgradeCoordinator: operator.address,
      validatorRegistry: validator.address,
      missionControl: policy.address,
      knowledgeGraph: deployer.address,
      heartbeatSeconds: 600,
      guardianReviewWindow: 900,
      maxDrawdownBps: 3500,
      manifestoURI: "ipfs://phase8/manifest/universal.json",
    };

    await expect(manager.connect(governance).setGlobalParameters(globalParams)).to.emit(
      manager,
      "GlobalParametersUpdated",
    );

    const storedGlobals = await manager.globalParameters();
    expect(storedGlobals.treasury).to.equal(globalParams.treasury);
    expect(storedGlobals.universalVault).to.equal(globalParams.universalVault);
    expect(storedGlobals.maxDrawdownBps).to.equal(globalParams.maxDrawdownBps);
    expect(storedGlobals.manifestoURI).to.equal(globalParams.manifestoURI);

    await expect(manager.connect(governance).setGuardianCouncil(operator.address))
      .to.emit(manager, "GuardianCouncilUpdated")
      .withArgs(operator.address);
    expect(await manager.guardianCouncil()).to.equal(operator.address);

    await expect(manager.connect(governance).setSystemPause(pauseHarness.target))
      .to.emit(manager, "SystemPauseUpdated")
      .withArgs(pauseHarness.target);

    await expect(manager.connect(deployer).setGlobalParameters(globalParams)).to.be.revertedWithCustomError(
      manager,
      "NotGovernance",
    );

    const domainConfig = {
      slug: "planetary-finance",
      name: "Planetary Finance Mesh",
      metadataURI: "ipfs://phase8/domains/planetary-finance.json",
      orchestrator: operator.address,
      capitalVault: vault.address,
      validatorModule: validator.address,
      policyKernel: policy.address,
      heartbeatSeconds: 300,
      tvlLimit: ethers.parseEther("1000000"),
      autonomyLevelBps: 7200,
      active: true,
    };

    const registerTx = await manager.connect(governance).registerDomain(domainConfig);
    const domainId = ethers.id(domainConfig.slug.toLowerCase());
    await expect(registerTx).to.emit(manager, "DomainRegistered");

    await expect(manager.connect(operator).registerDomain(domainConfig)).to.be.revertedWithCustomError(
      manager,
      "NotGovernance",
    );

    const storedDomain = await manager.getDomain(domainId);
    expect(storedDomain.metadataURI).to.equal(domainConfig.metadataURI);
    expect(storedDomain.orchestrator).to.equal(domainConfig.orchestrator);

    const domainListing = await manager.listDomains();
    expect(domainListing).to.have.lengthOf(1);
    expect(domainListing[0].id).to.equal(domainId);

    const updatedDomain = {
      ...domainConfig,
      metadataURI: "ipfs://phase8/domains/planetary-finance-v2.json",
      heartbeatSeconds: 420,
      tvlLimit: ethers.parseEther("1500000"),
      autonomyLevelBps: 8000,
      active: false,
    };

    await expect(manager.connect(governance).updateDomain(domainId, updatedDomain)).to.emit(
      manager,
      "DomainUpdated",
    );

    await expect(
      manager.connect(governance).configureDomainLimits(domainId, updatedDomain.tvlLimit, updatedDomain.autonomyLevelBps, 480),
    ).to.emit(manager, "DomainLimitsUpdated");

    await expect(manager.connect(governance).setDomainStatus(domainId, true))
      .to.emit(manager, "DomainStatusChanged")
      .withArgs(domainId, true);

    const sentinelProfile = {
      slug: "solar-shield",
      name: "Solar Shield Guardian",
      uri: "ipfs://phase8/sentinels/solar-shield.json",
      agent: sentinelAgent.address,
      coverageSeconds: 60,
      sensitivityBps: 250,
      active: true,
    };

    const sentinelId = ethers.id(sentinelProfile.slug.toLowerCase());
    await expect(manager.connect(governance).registerSentinel(sentinelProfile)).to.emit(
      manager,
      "SentinelRegistered",
    );

    const updatedSentinel = { ...sentinelProfile, coverageSeconds: 90, sensitivityBps: 500, active: false };
    await expect(manager.connect(governance).updateSentinel(sentinelId, updatedSentinel)).to.emit(
      manager,
      "SentinelUpdated",
    );

    await expect(manager.connect(governance).setSentinelStatus(sentinelId, true))
      .to.emit(manager, "SentinelStatusChanged")
      .withArgs(sentinelId, true);

    const sentinelListing = await manager.listSentinels();
    expect(sentinelListing).to.have.lengthOf(1);
    expect(sentinelListing[0].id).to.equal(sentinelId);

    const stream = {
      slug: "climate-stabilization",
      name: "Climate Stabilization Fund",
      uri: "ipfs://phase8/streams/climate.json",
      vault: streamVault.address,
      annualBudget: ethers.parseUnits("500000000", 6),
      expansionBps: 1200,
      active: true,
    };

    const streamId = ethers.id(stream.slug.toLowerCase());
    await expect(manager.connect(governance).registerCapitalStream(stream)).to.emit(
      manager,
      "CapitalStreamRegistered",
    );

    const updatedStream = { ...stream, annualBudget: ethers.parseUnits("750000000", 6), active: false };
    await expect(manager.connect(governance).updateCapitalStream(streamId, updatedStream)).to.emit(
      manager,
      "CapitalStreamUpdated",
    );

    await expect(manager.connect(governance).setCapitalStreamStatus(streamId, true))
      .to.emit(manager, "CapitalStreamStatusChanged")
      .withArgs(streamId, true);

    const streams = await manager.listCapitalStreams();
    expect(streams).to.have.lengthOf(1);
    expect(streams[0].id).to.equal(streamId);

    const pauseData = pauseHarness.interface.encodeFunctionData("pauseAll", []);
    await expect(manager.connect(governance).forwardPauseCall(pauseData))
      .to.emit(manager, "PauseCallForwarded")
      .withArgs(pauseHarness.target, pauseData, anyValue);

    expect(await pauseHarness.paused()).to.equal(true);

    await expect(manager.connect(governance).updateManifesto("ipfs://phase8/manifest/v2.json")).to.emit(
      manager,
      "GlobalParametersUpdated",
    );

    await expect(manager.connect(governance).updateRiskParameters(700, 1000, 4200)).to.emit(
      manager,
      "GlobalParametersUpdated",
    );

    const refreshedGlobals = await manager.globalParameters();
    expect(refreshedGlobals.manifestoURI).to.equal("ipfs://phase8/manifest/v2.json");
    expect(refreshedGlobals.heartbeatSeconds).to.equal(700);
    expect(refreshedGlobals.guardianReviewWindow).to.equal(1000);
    expect(refreshedGlobals.maxDrawdownBps).to.equal(4200);
  });
});
