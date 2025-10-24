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

    await expect(manager.connect(governance).setSentinelDomains(sentinelId, [domainId]))
      .to.emit(manager, "SentinelDomainsUpdated")
      .withArgs(sentinelId, [domainId]);

    expect(await manager.getSentinelDomains(sentinelId)).to.deep.equal([domainId]);

    await expect(
      manager.connect(governance).setSentinelDomains(sentinelId, [ethers.id("unknown-domain")]),
    ).to.be.revertedWithCustomError(manager, "UnknownDomain");

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
    const sentinelView = await manager.getSentinel(sentinelId);
    expect(sentinelView.uri).to.equal(sentinelProfile.uri);
    await expect(manager.getSentinel(ethers.id("unknown-sentinel"))).to.be.revertedWithCustomError(
      manager,
      "UnknownSentinel",
    );

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

    await expect(manager.connect(governance).setCapitalStreamDomains(streamId, [domainId]))
      .to.emit(manager, "CapitalStreamDomainsUpdated")
      .withArgs(streamId, [domainId]);

    expect(await manager.getCapitalStreamDomains(streamId)).to.deep.equal([domainId]);

    await expect(
      manager.connect(governance).setCapitalStreamDomains(streamId, [ethers.id("unknown-domain")]),
    ).to.be.revertedWithCustomError(manager, "UnknownDomain");

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
    const streamView = await manager.getCapitalStream(streamId);
    expect(streamView.uri).to.equal(stream.uri);
    await expect(manager.getCapitalStream(ethers.id("unknown-stream"))).to.be.revertedWithCustomError(
      manager,
      "UnknownStream",
    );

    await expect(manager.connect(governance).removeDomain(domainId)).to.emit(manager, "DomainRemoved");
    expect(await manager.listDomains()).to.have.lengthOf(0);
    expect(await manager.getSentinelDomains(sentinelId)).to.have.lengthOf(0);
    expect(await manager.getCapitalStreamDomains(streamId)).to.have.lengthOf(0);

    await expect(manager.connect(governance).removeSentinel(sentinelId))
      .to.emit(manager, "SentinelRemoved")
      .withArgs(sentinelId);
    expect(await manager.listSentinels()).to.have.lengthOf(0);

    await expect(manager.connect(governance).removeCapitalStream(streamId))
      .to.emit(manager, "CapitalStreamRemoved")
      .withArgs(streamId);
    expect(await manager.listCapitalStreams()).to.have.lengthOf(0);

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

    const plan = {
      planURI: "ipfs://phase8/self-improvement/plan.json",
      planHash: ethers.id("phase8-self-improvement"),
      cadenceSeconds: 7200,
      lastExecutedAt: 0,
      lastReportURI: "",
    } as const;

    await expect(manager.connect(governance).setSelfImprovementPlan(plan))
      .to.emit(manager, "SelfImprovementPlanUpdated")
      .withArgs(plan.planURI, plan.planHash, plan.cadenceSeconds, plan.lastExecutedAt, plan.lastReportURI);

    const storedPlan = await manager.selfImprovementPlan();
    expect(storedPlan.planURI).to.equal(plan.planURI);
    expect(storedPlan.planHash).to.equal(plan.planHash);
    expect(storedPlan.cadenceSeconds).to.equal(plan.cadenceSeconds);
    expect(storedPlan.lastExecutedAt).to.equal(plan.lastExecutedAt);

    await expect(
      manager.connect(operator).setSelfImprovementPlan({ ...plan, planHash: ethers.ZeroHash }),
    ).to.be.revertedWithCustomError(manager, "NotGovernance");

    await expect(
      manager.connect(governance).setSelfImprovementPlan({ ...plan, planHash: ethers.ZeroHash }),
    ).to.be.revertedWithCustomError(manager, "InvalidPlanHash");

    const executionTimestamp = 1_700_000_000;
    const executionReport = "ipfs://phase8/self-improvement/report-1.json";
    await expect(manager.connect(governance).recordSelfImprovementExecution(executionTimestamp, executionReport))
      .to.emit(manager, "SelfImprovementExecutionRecorded")
      .withArgs(executionTimestamp, executionReport, plan.planHash);

    const executedPlan = await manager.selfImprovementPlan();
    expect(executedPlan.lastExecutedAt).to.equal(executionTimestamp);
    expect(executedPlan.lastReportURI).to.equal(executionReport);

    await expect(
      manager.connect(governance).recordSelfImprovementExecution(executionTimestamp + 3600, "report.json"),
    ).to.be.revertedWithCustomError(manager, "InvalidURI").withArgs("reportURI");

    const httpsReport = "https://phase8.example/self-improvement/report-2.json";
    await expect(manager.connect(governance).recordSelfImprovementExecution(executionTimestamp + 3600, httpsReport))
      .to.emit(manager, "SelfImprovementExecutionRecorded")
      .withArgs(executionTimestamp + 3600, httpsReport, plan.planHash);

    await expect(
      manager.connect(governance).recordSelfImprovementExecution(executionTimestamp - 1, executionReport),
    ).to.be.revertedWithCustomError(manager, "InvalidExecutionTimestamp");

    await expect(
      manager.connect(operator).recordSelfImprovementExecution(executionTimestamp + 1, executionReport),
    ).to.be.revertedWithCustomError(manager, "NotGovernance");
  });
});
