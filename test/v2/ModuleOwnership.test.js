const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Module ownership isolation", function () {
  let owner, other, token;

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory(
      "contracts/mocks/MockERC20.sol:MockERC20"
    );
    token = await Token.deploy();
    await token.waitForDeployment();
  });

  it("restricts parameter tuning to owners", async () => {
    const Stake = await ethers.getContractFactory(
      "contracts/v2/StakeManager.sol:StakeManager"
    );
    const stake = await Stake.deploy(
      await token.getAddress(),
      0,
      0,
      0,
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await stake.waitForDeployment();

    await expect(
      stake.connect(other).setToken(other.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    const FeePoolFactory = await ethers.getContractFactory(
      "contracts/v2/FeePool.sol:FeePool"
    );
    const feePool = await FeePoolFactory.deploy(
      await stake.getAddress(),
      await token.getAddress(),
      0,
      owner.address,
      0
    );
    await feePool.waitForDeployment();
    await expect(
      feePool.connect(other).setBurnPct(1)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    const VMFactory = await ethers.getContractFactory(
      "contracts/v2/ValidationModule.sol:ValidationModule"
    );
    const validation = await VMFactory.deploy(
      ethers.ZeroAddress,
      await stake.getAddress(),
      0,
      0,
      0,
      0,
      []
    );
    await validation.waitForDeployment();
    await expect(
      validation.connect(other).setTreasury(other.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    const JRFactory = await ethers.getContractFactory(
      "contracts/v2/JobRegistry.sol:JobRegistry"
    );
    const registry = await JRFactory.deploy(
      await validation.getAddress(),
      await stake.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      []
    );
    await registry.waitForDeployment();
    await expect(
      registry.connect(other).setJobParameters(1, 1)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    const DMFactory = await ethers.getContractFactory(
      "contracts/v2/DisputeModule.sol:DisputeModule"
    );
    const dispute = await DMFactory.deploy(
      await registry.getAddress(),
      0,
      0,
      ethers.ZeroAddress
    );
    await dispute.waitForDeployment();
    await expect(
      dispute.connect(other).setAppealFee(2)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    const CNFTFactory = await ethers.getContractFactory(
      "contracts/v2/CertificateNFT.sol:CertificateNFT"
    );
    const cert = await CNFTFactory.deploy("JobCert", "JC");
    await cert.waitForDeployment();
    await expect(
      cert.connect(other).setBaseURI("ipfs://test")
    ).to.be.revertedWith("Ownable: caller is not the owner");

    const REFactory = await ethers.getContractFactory(
      "contracts/v2/ReputationEngine.sol:ReputationEngine"
    );
    const rep = await REFactory.deploy(
      await stake.getAddress(),
      0,
      0,
      0
    );
    await rep.waitForDeployment();
    await expect(
      rep.connect(other).setThreshold(1)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    const PRFactory = await ethers.getContractFactory(
      "contracts/v2/PlatformRegistry.sol:PlatformRegistry"
    );
    const pr = await PRFactory.deploy(
      await stake.getAddress(),
      await rep.getAddress(),
      0
    );
    await pr.waitForDeployment();
    await expect(
      pr.connect(other).setMinPlatformStake(1)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    const JRtFactory = await ethers.getContractFactory(
      "contracts/v2/JobRouter.sol:JobRouter"
    );
    const router = await JRtFactory.deploy(await pr.getAddress());
    await router.waitForDeployment();
    await expect(
      router.connect(other).setRegistrar(other.address, true)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    const TPFactory = await ethers.getContractFactory(
      "contracts/v2/TaxPolicy.sol:TaxPolicy"
    );
    const tax = await TPFactory.deploy("uri", "ack");
    await tax.waitForDeployment();
    await expect(
      tax.connect(other).setPolicyURI("uri2")
    ).to.be.revertedWith("Ownable: caller is not the owner");

    expect(await stake.owner()).to.equal(owner.address);
    expect(await feePool.owner()).to.equal(owner.address);
    expect(await validation.owner()).to.equal(owner.address);
    expect(await registry.owner()).to.equal(owner.address);
    expect(await dispute.owner()).to.equal(owner.address);
    expect(await cert.owner()).to.equal(owner.address);
    expect(await rep.owner()).to.equal(owner.address);
    expect(await pr.owner()).to.equal(owner.address);
    expect(await router.owner()).to.equal(owner.address);
    expect(await tax.owner()).to.equal(owner.address);
  });
});
