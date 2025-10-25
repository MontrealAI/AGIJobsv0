import { expect } from "chai";
import { ethers } from "hardhat";

async function deployPhase6DomainRegistry(governance: string) {
  const factory = await ethers.getContractFactory("Phase6DomainRegistry");
  const contract = await factory.deploy(governance);
  await contract.waitForDeployment();
  return contract;
}

describe("Phase6DomainRegistry", function () {
  it("allows governance to manage domains, skills, credentials and agent approvals", async function () {
    const [_deployer, governance, agent, attestor] = await ethers.getSigners();
    const registry = await deployPhase6DomainRegistry(governance.address);

    const slug = "Finance";
    const manifestHash = ethers.id("finance-manifest");

    await expect(
      registry
        .connect(governance)
        .registerDomain(slug, "Global Finance Mesh", "ipfs://phase6/domains/finance.json", manifestHash, true),
    )
      .to.emit(registry, "DomainRegistered")
      .withArgs(ethers.id(slug.toLowerCase()), slug.toLowerCase(), "Global Finance Mesh", "ipfs://phase6/domains/finance.json", manifestHash);

    const domainId = await registry.domainId(slug);
    const domain = await registry.getDomain(domainId);
    expect(domain.slug).to.equal(slug.toLowerCase());
    expect(domain.active).to.equal(true);

    const skillKey = "quantum-risk";
    await expect(
      registry
        .connect(governance)
        .registerSkill(domainId, skillKey, "Quantum Risk Sentinel", "ipfs://phase6/skills/quantum-risk.json", true),
    )
      .to.emit(registry, "SkillRegistered")
      .withArgs(domainId, ethers.id(skillKey), skillKey, "Quantum Risk Sentinel", "ipfs://phase6/skills/quantum-risk.json", true);

    await expect(
      registry.connect(governance).setCredentialRule(domainId, {
        attestor: attestor.address,
        schemaId: ethers.id("finance-schema"),
        uri: "ipfs://phase6/credentials/finance.json",
        requiresCredential: true,
        active: true,
        updatedAt: 0,
      }),
    )
      .to.emit(registry, "CredentialRuleUpdated")
      .withArgs(domainId, attestor.address, ethers.id("finance-schema"), "ipfs://phase6/credentials/finance.json", true, true);

    await expect(
      registry.connect(agent).registerAgentProfile({
        domain: slug,
        didURI: "did:agi:finance:atlas",
        manifestHash: ethers.id("atlas"),
        credentialHash: ethers.id("atlas-credential"),
        skills: [skillKey],
      }),
    )
      .to.emit(registry, "AgentProfileRegistered")
      .withArgs(domainId, agent.address, "did:agi:finance:atlas", ethers.id("atlas"));

    const [profile, skills] = await registry.getAgentProfile(agent.address, domainId);
    expect(profile.didURI).to.equal("did:agi:finance:atlas");
    expect(profile.manifestHash).to.equal(ethers.id("atlas"));
    expect(profile.active).to.equal(true);
    expect(skills).to.deep.equal([ethers.id(skillKey)]);

    await expect(registry.connect(governance).setAgentApproval(domainId, agent.address, true))
      .to.emit(registry, "AgentProfileApproval")
      .withArgs(domainId, agent.address, true);

    await expect(registry.connect(governance).setAgentStatus(domainId, agent.address, false))
      .to.emit(registry, "AgentProfileStatus")
      .withArgs(domainId, agent.address, false);

    const domains = await registry.listDomains();
    expect(domains).to.have.lengthOf(1);
    expect(domains[0].id).to.equal(domainId);

    const skillsListing = await registry.listSkills(domainId);
    expect(skillsListing).to.have.lengthOf(1);
    expect(skillsListing[0].id).to.equal(ethers.id(skillKey));
  });

  it("rejects agent registrations lacking credentials when skills require them", async function () {
    const [, governance, agent] = await ethers.getSigners();
    const registry = await deployPhase6DomainRegistry(governance.address);

    const slug = "Healthcare";
    await registry
      .connect(governance)
      .registerDomain(slug, "Health Mesh", "ipfs://phase6/domains/health.json", ethers.id("health-manifest"), true);
    const domainId = await registry.domainId(slug);

    await registry
      .connect(governance)
      .registerSkill(domainId, "clinical", "Clinical QA", "ipfs://phase6/skills/clinical.json", true);

    await expect(
      registry.connect(agent).registerAgentProfile({
        domain: slug,
        didURI: "did:agi:health:aurora",
        manifestHash: ethers.id("aurora"),
        credentialHash: ethers.ZeroHash,
        skills: ["clinical"],
      }),
    ).to.be.revertedWithCustomError(registry, "CredentialRequired");
  });

  it("prevents updates when a domain is inactive", async function () {
    const [, governance, agent] = await ethers.getSigners();
    const registry = await deployPhase6DomainRegistry(governance.address);

    const slug = "Logistics";
    await registry
      .connect(governance)
      .registerDomain(slug, "Planetary Logistics", "ipfs://phase6/domains/logistics.json", ethers.id("logistics"), false);

    await expect(
      registry.connect(agent).registerAgentProfile({
        domain: slug,
        didURI: "did:agi:logistics:zephyr",
        manifestHash: ethers.id("zephyr"),
        credentialHash: ethers.ZeroHash,
        skills: [],
      }),
    ).to.be.revertedWithCustomError(registry, "DomainInactive");
  });
});
