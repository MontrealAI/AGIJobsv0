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

  it("guards configuration invariants", async function () {
    await expect(manager.connect(governance).domainId(""))
      .to.be.revertedWithCustomError(manager, "EmptySlug");

    await expect(
      manager.connect(governance).registerDomain(
        domainStruct({ slug: "health", validationModule: ethers.ZeroAddress }),
      ),
    ).to.be.revertedWithCustomError(manager, "InvalidAddress");

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
