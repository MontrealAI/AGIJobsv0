const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deploy(name, ...args) {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

function domainStruct(overrides = {}) {
    return {
        slug: "finance",
        name: "Global Finance Swarm",
        metadataURI: "ipfs://phase6/finance",
    validationModule: ethers.ZeroAddress,
    dataOracle: ethers.ZeroAddress,
    l2Gateway: ethers.ZeroAddress,
    subgraphEndpoint: "https://phase6.montreal.ai/subgraphs/finance",
    executionRouter: ethers.ZeroAddress,
    heartbeatSeconds: 120,
    active: true,
        ...overrides,
    };
}

function operationsStruct(overrides = {}) {
    return {
        maxActiveJobs: 48,
        maxQueueDepth: 240,
        minStake: ethers.parseEther("100"),
        treasuryShareBps: 250,
        circuitBreakerBps: 7500,
        requiresHumanValidation: false,
        ...overrides,
    };
}

function telemetryStruct(overrides = {}) {
    return {
        resilienceBps: 9200,
        automationBps: 8800,
        complianceBps: 9100,
        settlementLatencySeconds: 45,
        usesL2Settlement: true,
        sentinelOracle: ethers.ZeroAddress,
        settlementAsset: ethers.ZeroAddress,
        metricsDigest: ethers.id("metrics"),
        manifestHash: ethers.id("manifest"),
        ...overrides,
    };
}

function infrastructureStruct(overrides = {}) {
    return {
        agentOps: ethers.ZeroAddress,
        dataPipeline: ethers.ZeroAddress,
        credentialVerifier: ethers.ZeroAddress,
        fallbackOperator: ethers.ZeroAddress,
        controlPlaneURI: "ipfs://phase6/domains/finance/autopilot.json",
        autopilotCadence: 180,
        autopilotEnabled: true,
        ...overrides,
    };
}

describe("Phase6ExpansionManager", function () {
  let governance;
  let outsider;
  let validationStub;
  let pauseHarness;
  let escalationBridge;
  let manager;

  beforeEach(async function () {
    [, governance, outsider] = await ethers.getSigners();
    validationStub = await deploy("ValidationStub");
    pauseHarness = await deploy("Phase6MockSystemPause");
    escalationBridge = await deploy("Phase6EscalationBridgeMock");
    manager = await deploy("Phase6ExpansionManager", governance.address);
  });

  it("registers, lists and updates domains under governance control", async function () {
    const config = domainStruct({ validationModule: validationStub.target });
    const tx = await manager.connect(governance).registerDomain(config);
    await expect(tx)
      .to.emit(manager, "DomainRegistered")
      .withArgs(
        ethers.id(config.slug.toLowerCase()),
        config.slug,
        config.name,
        config.metadataURI,
        config.validationModule,
        config.dataOracle,
        config.l2Gateway,
        config.subgraphEndpoint,
        config.executionRouter,
        config.heartbeatSeconds,
        config.active,
      );

    await expect(manager.connect(outsider).registerDomain(config)).to.be.revertedWithCustomError(
      manager,
      "NotGovernance",
    );

    const id = await manager.domainId(config.slug);
    expect(id).to.equal(ethers.id(config.slug.toLowerCase()));

    const stored = await manager.getDomain(id);
    expect(stored.slug).to.equal(config.slug);
    expect(stored.metadataURI).to.equal(config.metadataURI);
    expect(stored.validationModule).to.equal(config.validationModule);
    expect(stored.active).to.equal(true);

    const listing = await manager.listDomains();
    expect(listing).to.have.lengthOf(1);
    expect(listing[0].id).to.equal(id);
    expect(listing[0].config.slug).to.equal(config.slug);

    const updatedConfig = {
      ...config,
      metadataURI: "ipfs://phase6/finance/v2",
      heartbeatSeconds: 240,
      active: false,
    };

    const updateTx = await manager.connect(governance).updateDomain(id, updatedConfig);
    await expect(updateTx)
      .to.emit(manager, "DomainUpdated")
      .withArgs(
        id,
        updatedConfig.slug,
        updatedConfig.name,
        updatedConfig.metadataURI,
        updatedConfig.validationModule,
        updatedConfig.dataOracle,
        updatedConfig.l2Gateway,
        updatedConfig.subgraphEndpoint,
        updatedConfig.executionRouter,
        updatedConfig.heartbeatSeconds,
        updatedConfig.active,
      );

    const refreshed = await manager.getDomain(id);
    expect(refreshed.metadataURI).to.equal("ipfs://phase6/finance/v2");
    expect(refreshed.heartbeatSeconds).to.equal(240);
    expect(refreshed.active).to.equal(false);
  });

  it("updates connectors and toggles domains", async function () {
    const config = domainStruct({
      validationModule: validationStub.target,
      dataOracle: escalationBridge.target,
      l2Gateway: pauseHarness.target,
      executionRouter: validationStub.target,
    });
    const id = await manager
      .connect(governance)
      .registerDomain(config)
      .then((tx) => tx.wait())
      .then(() => manager.domainId(config.slug));

    await expect(manager.connect(governance).setDomainStatus(id, false)).to.emit(
      manager,
      "DomainStatusChanged",
    );
    await expect(manager.connect(governance).setDomainStatus(id, true)).to.emit(
      manager,
      "DomainStatusChanged",
    );

    await expect(
      manager
        .connect(governance)
        .configureDomainConnectors(
          id,
          validationStub.target,
          pauseHarness.target,
          escalationBridge.target,
          "https://phase6-updated.montreal.ai/subgraphs/finance",
          validationStub.target,
          360,
        ),
    )
      .to.emit(manager, "DomainUpdated")
      .withArgs(
        id,
        config.slug,
        config.name,
        config.metadataURI,
        validationStub.target,
        pauseHarness.target,
        escalationBridge.target,
        "https://phase6-updated.montreal.ai/subgraphs/finance",
        validationStub.target,
        360,
        true,
      );

    const stored = await manager.getDomain(id);
    expect(stored.dataOracle).to.equal(pauseHarness.target);
    expect(stored.l2Gateway).to.equal(escalationBridge.target);
    expect(stored.subgraphEndpoint).to.equal("https://phase6-updated.montreal.ai/subgraphs/finance");
    expect(stored.heartbeatSeconds).to.equal(360);
  });

  it("manages global config, pause forwarding and escalation bridges", async function () {
    const config = domainStruct({ validationModule: validationStub.target });
    const id = await manager
      .connect(governance)
      .registerDomain(config)
      .then((tx) => tx.wait())
      .then(() => manager.domainId(config.slug));

    await expect(
      manager.connect(governance).setGlobalConfig({
        iotOracleRouter: pauseHarness.target,
        defaultL2Gateway: escalationBridge.target,
        didRegistry: validationStub.target,
        treasuryBridge: escalationBridge.target,
        l2SyncCadence: 90,
        manifestURI: "ipfs://phase6/manifest/global.json",
      }),
    )
      .to.emit(manager, "GlobalConfigUpdated")
      .withArgs(
        pauseHarness.target,
        escalationBridge.target,
        validationStub.target,
        escalationBridge.target,
        90,
        "ipfs://phase6/manifest/global.json",
      );

    await expect(manager.connect(outsider).setSystemPause(pauseHarness.target)).to.be.revertedWithCustomError(
      manager,
      "NotGovernance",
    );

    await expect(manager.connect(governance).setSystemPause(pauseHarness.target))
      .to.emit(manager, "SystemPauseUpdated")
      .withArgs(pauseHarness.target);

    await expect(manager.connect(governance).setEscalationBridge(escalationBridge.target))
      .to.emit(manager, "EscalationBridgeUpdated")
      .withArgs(escalationBridge.target);

    await expect(
      manager.connect(governance).forwardPauseCall(pauseHarness.interface.encodeFunctionData("pauseAll")),
    )
      .to.emit(pauseHarness, "ForwardReceived")
      .withArgs(pauseHarness.interface.encodeFunctionData("pauseAll"));
    expect(await pauseHarness.paused()).to.equal(true);
    expect(await pauseHarness.callCount()).to.equal(1n);

    const payload = ethers.AbiCoder.defaultAbiCoder().encode(["bytes"], [ethers.toUtf8Bytes("critical")]);
    await expect(
      manager
        .connect(governance)
        .forwardEscalation(
          escalationBridge.interface.encodeFunctionData("execute", [payload]),
        ),
    )
      .to.emit(escalationBridge, "Escalation")
      .withArgs(payload, manager.target);

    const bridgeStored = await escalationBridge.lastPayload();
    expect(bridgeStored).to.equal(payload);
    expect(await escalationBridge.lastCaller()).to.equal(manager.target);
    expect(await escalationBridge.callCount()).to.equal(1n);

    await expect(manager.connect(governance).getDomain(id)).to.not.be.reverted;
  });

  it("configures domain operations and global guard rails", async function () {
    const config = domainStruct({ validationModule: validationStub.target });
    await manager.connect(governance).registerDomain(config);
    const id = await manager.domainId(config.slug);

    const ops = operationsStruct({ requiresHumanValidation: true });
    await expect(manager.connect(governance).setDomainOperations(id, ops))
      .to.emit(manager, "DomainOperationsUpdated")
      .withArgs(
        id,
        ops.maxActiveJobs,
        ops.maxQueueDepth,
        ops.minStake,
        ops.treasuryShareBps,
        ops.circuitBreakerBps,
        true,
      );

    const storedOps = await manager.getDomainOperations(id);
    expect(storedOps.maxActiveJobs).to.equal(ops.maxActiveJobs);
    expect(storedOps.maxQueueDepth).to.equal(ops.maxQueueDepth);
    expect(storedOps.minStake).to.equal(ops.minStake);
    expect(storedOps.requiresHumanValidation).to.equal(true);

    await expect(manager.connect(outsider).setDomainOperations(id, ops)).to.be.revertedWithCustomError(
      manager,
      "NotGovernance",
    );

    const guards = {
      treasuryBufferBps: 400,
      circuitBreakerBps: 6400,
      anomalyGracePeriod: 180,
      autoPauseEnabled: true,
      oversightCouncil: pauseHarness.target,
    };

    await expect(manager.connect(governance).setGlobalGuards(guards))
      .to.emit(manager, "GlobalGuardsUpdated")
      .withArgs(
        guards.treasuryBufferBps,
        guards.circuitBreakerBps,
        guards.anomalyGracePeriod,
        guards.autoPauseEnabled,
        guards.oversightCouncil,
      );

    const storedGuards = await manager.globalGuards();
    expect(storedGuards.treasuryBufferBps).to.equal(guards.treasuryBufferBps);
    expect(storedGuards.circuitBreakerBps).to.equal(guards.circuitBreakerBps);
    expect(storedGuards.anomalyGracePeriod).to.equal(guards.anomalyGracePeriod);
    expect(storedGuards.autoPauseEnabled).to.equal(true);
    expect(storedGuards.oversightCouncil).to.equal(guards.oversightCouncil);
  });

  it("manages domain and global infrastructure wiring", async function () {
    const config = domainStruct({ validationModule: validationStub.target });
    await manager.connect(governance).registerDomain(config);
    const id = await manager.domainId(config.slug);

    const infrastructure = infrastructureStruct({
      agentOps: validationStub.target,
      dataPipeline: pauseHarness.target,
      credentialVerifier: escalationBridge.target,
      fallbackOperator: governance.address,
      controlPlaneURI: "ipfs://phase6/domains/finance/infrastructure.json",
      autopilotCadence: 240,
    });

    await expect(manager.connect(governance).setDomainInfrastructure(id, infrastructure))
      .to.emit(manager, "DomainInfrastructureUpdated")
      .withArgs(
        id,
        infrastructure.agentOps,
        infrastructure.dataPipeline,
        infrastructure.credentialVerifier,
        infrastructure.fallbackOperator,
        infrastructure.controlPlaneURI,
        BigInt(infrastructure.autopilotCadence),
        infrastructure.autopilotEnabled,
      );

    const storedInfra = await manager.getDomainInfrastructure(id);
    expect(storedInfra.agentOps).to.equal(infrastructure.agentOps);
    expect(storedInfra.controlPlaneURI).to.equal("ipfs://phase6/domains/finance/infrastructure.json");
    expect(storedInfra.autopilotCadence).to.equal(240n);
    expect(storedInfra.autopilotEnabled).to.equal(true);

    await expect(
      manager.connect(governance).setDomainInfrastructure(
        id,
        infrastructureStruct({
          controlPlaneURI: "",
        }),
      ),
    ).to.be.revertedWithCustomError(manager, "InvalidInfrastructureURI");

    await expect(
      manager.connect(governance).setDomainInfrastructure(
        id,
        infrastructureStruct({
          autopilotCadence: 15,
        }),
      ),
    ).to.be.revertedWithCustomError(manager, "InvalidAutopilotCadence");

    const globalInfra = {
      meshCoordinator: validationStub.target,
      dataLake: pauseHarness.target,
      identityBridge: escalationBridge.target,
      topologyURI: "ipfs://phase6/topology.json",
      autopilotCadence: 360,
      enforceDecentralizedInfra: true,
    };

    await expect(manager.connect(governance).setGlobalInfrastructure(globalInfra))
      .to.emit(manager, "GlobalInfrastructureUpdated")
      .withArgs(
        globalInfra.meshCoordinator,
        globalInfra.dataLake,
        globalInfra.identityBridge,
        globalInfra.topologyURI,
        BigInt(globalInfra.autopilotCadence),
        globalInfra.enforceDecentralizedInfra,
      );

    const storedGlobalInfra = await manager.globalInfrastructure();
    expect(storedGlobalInfra.meshCoordinator).to.equal(globalInfra.meshCoordinator);
    expect(storedGlobalInfra.topologyURI).to.equal(globalInfra.topologyURI);
    expect(storedGlobalInfra.autopilotCadence).to.equal(BigInt(globalInfra.autopilotCadence));

    await expect(
      manager.connect(governance).setGlobalInfrastructure({
        ...globalInfra,
        autopilotCadence: 10,
      }),
    ).to.be.revertedWithCustomError(manager, "InvalidAutopilotCadence");

    await expect(
      manager.connect(outsider).setDomainInfrastructure(id, infrastructure),
    ).to.be.revertedWithCustomError(manager, "NotGovernance");
  });

  it("tracks telemetry for domains and global thresholds", async function () {
    const config = domainStruct({ validationModule: validationStub.target });
    await manager.connect(governance).registerDomain(config);
    const id = await manager.domainId(config.slug);

    const telemetry = telemetryStruct({ sentinelOracle: validationStub.target });
    await expect(manager.connect(outsider).setDomainTelemetry(id, telemetry)).to.be.revertedWithCustomError(
      manager,
      "NotGovernance",
    );

    await expect(manager.connect(governance).setDomainTelemetry(id, telemetry))
      .to.emit(manager, "DomainTelemetryUpdated")
      .withArgs(
        id,
        telemetry.resilienceBps,
        telemetry.automationBps,
        telemetry.complianceBps,
        telemetry.settlementLatencySeconds,
        telemetry.usesL2Settlement,
        telemetry.sentinelOracle,
        telemetry.settlementAsset,
        telemetry.metricsDigest,
        telemetry.manifestHash,
      );

    const storedTelemetry = await manager.getDomainTelemetry(id);
    expect(storedTelemetry.resilienceBps).to.equal(telemetry.resilienceBps);
    expect(storedTelemetry.usesL2Settlement).to.equal(true);
    expect(storedTelemetry.metricsDigest).to.equal(telemetry.metricsDigest);

    const telemetryUpdate = telemetryStruct({
      resilienceBps: 9500,
      settlementLatencySeconds: 120,
      usesL2Settlement: false,
      settlementAsset: pauseHarness.target,
      manifestHash: ethers.id("manifest-v2"),
      metricsDigest: ethers.id("metrics-v2"),
    });

    await expect(manager.connect(governance).setDomainTelemetry(id, telemetryUpdate))
      .to.emit(manager, "DomainTelemetryUpdated")
      .withArgs(
        id,
        telemetryUpdate.resilienceBps,
        telemetryUpdate.automationBps,
        telemetryUpdate.complianceBps,
        telemetryUpdate.settlementLatencySeconds,
        telemetryUpdate.usesL2Settlement,
        telemetryUpdate.sentinelOracle,
        telemetryUpdate.settlementAsset,
        telemetryUpdate.metricsDigest,
        telemetryUpdate.manifestHash,
      );

    const globalTelemetry = {
      manifestHash: ethers.id("global-manifest"),
      metricsDigest: ethers.id("global-digest"),
      resilienceFloorBps: 9000,
      automationFloorBps: 8700,
      oversightWeightBps: 6400,
    };

    await expect(manager.connect(outsider).setGlobalTelemetry(globalTelemetry)).to.be.revertedWithCustomError(
      manager,
      "NotGovernance",
    );

    await expect(manager.connect(governance).setGlobalTelemetry(globalTelemetry))
      .to.emit(manager, "GlobalTelemetryUpdated")
      .withArgs(
        globalTelemetry.manifestHash,
        globalTelemetry.metricsDigest,
        globalTelemetry.resilienceFloorBps,
        globalTelemetry.automationFloorBps,
        globalTelemetry.oversightWeightBps,
      );

    const storedGlobal = await manager.globalTelemetry();
    expect(storedGlobal.manifestHash).to.equal(globalTelemetry.manifestHash);
    expect(storedGlobal.resilienceFloorBps).to.equal(globalTelemetry.resilienceFloorBps);

    await expect(
      manager.connect(governance).setDomainTelemetry(
        id,
        telemetryStruct({ metricsDigest: ethers.ZeroHash }),
      ),
    )
      .to.be.revertedWithCustomError(manager, "InvalidDigest")
      .withArgs("metricsDigest");
  });

  it("enforces operational guard rail invariants", async function () {
    const config = domainStruct({ validationModule: validationStub.target });
    await manager.connect(governance).registerDomain(config);
    const id = await manager.domainId(config.slug);

    await expect(
      manager.connect(governance).setDomainOperations(
        id,
        operationsStruct({ maxActiveJobs: 0 }),
      ),
    ).to.be.revertedWithCustomError(manager, "InvalidOperationsValue").withArgs("maxActiveJobs");

    await expect(
      manager.connect(governance).setDomainOperations(
        id,
        operationsStruct({ maxQueueDepth: 10, maxActiveJobs: 20 }),
      ),
    ).to.be.revertedWithCustomError(manager, "InvalidOperationsValue").withArgs("maxQueueDepth");

    await expect(
      manager.connect(governance).setDomainOperations(
        id,
        operationsStruct({ minStake: 0 }),
      ),
    ).to.be.revertedWithCustomError(manager, "InvalidOperationsValue").withArgs("minStake");

    await expect(
      manager.connect(governance).setDomainOperations(
        id,
        operationsStruct({ treasuryShareBps: 12_000 }),
      ),
    ).to.be.revertedWithCustomError(manager, "InvalidBps").withArgs("treasuryShareBps", 12_000);

    await expect(
      manager.connect(governance).setDomainOperations(
        id,
        operationsStruct({ circuitBreakerBps: 11_000 }),
      ),
    ).to.be.revertedWithCustomError(manager, "InvalidBps").withArgs("circuitBreakerBps", 11_000);

    await expect(
      manager.connect(governance).setGlobalGuards({
        treasuryBufferBps: 11_000,
        circuitBreakerBps: 100,
        anomalyGracePeriod: 180,
        autoPauseEnabled: true,
        oversightCouncil: pauseHarness.target,
      }),
    ).to.be.revertedWithCustomError(manager, "InvalidBps").withArgs("treasuryBufferBps", 11_000);

    await expect(
      manager.connect(governance).setGlobalGuards({
        treasuryBufferBps: 500,
        circuitBreakerBps: 11_000,
        anomalyGracePeriod: 180,
        autoPauseEnabled: true,
        oversightCouncil: pauseHarness.target,
      }),
    ).to.be.revertedWithCustomError(manager, "InvalidBps").withArgs("circuitBreakerBps", 11_000);

    await expect(
      manager.connect(governance).setGlobalGuards({
        treasuryBufferBps: 500,
        circuitBreakerBps: 400,
        anomalyGracePeriod: 10,
        autoPauseEnabled: false,
        oversightCouncil: pauseHarness.target,
      }),
    ).to.be.revertedWithCustomError(manager, "InvalidAnomalyGracePeriod");

    await expect(
      manager.connect(governance).setGlobalGuards({
        treasuryBufferBps: 500,
        circuitBreakerBps: 400,
        anomalyGracePeriod: 120,
        autoPauseEnabled: false,
        oversightCouncil: ethers.ZeroAddress,
      }),
    ).to.emit(manager, "GlobalGuardsUpdated");
  });

  it("guards configuration invariants", async function () {
    await expect(manager.connect(governance).domainId(""))
      .to.be.revertedWithCustomError(manager, "EmptySlug");

    await expect(
      manager.connect(governance).registerDomain(
        domainStruct({ slug: "health", validationModule: ethers.ZeroAddress }),
      ),
    ).to.be.revertedWithCustomError(manager, "InvalidAddress");

    await expect(
      manager.connect(governance).registerDomain(
        domainStruct({
          subgraphEndpoint: "",
          validationModule: validationStub.target,
        }),
      ),
    ).to.be.revertedWithCustomError(manager, "InvalidSubgraphEndpoint");

    const valid = domainStruct({ validationModule: validationStub.target });
    await manager.connect(governance).registerDomain(valid);
    const id = await manager.domainId(valid.slug);
    await expect(
      manager.connect(governance).updateDomain(id, {
        ...valid,
        subgraphEndpoint: "",
      }),
    ).to.be.revertedWithCustomError(manager, "InvalidSubgraphEndpoint");

    await expect(
      manager.connect(governance).setGlobalConfig({
        iotOracleRouter: ethers.ZeroAddress,
        defaultL2Gateway: ethers.ZeroAddress,
        didRegistry: ethers.ZeroAddress,
        treasuryBridge: ethers.ZeroAddress,
        l2SyncCadence: 10,
        manifestURI: "",
      }),
    ).to.be.revertedWithCustomError(manager, "InvalidManifestURI");
  });
});
