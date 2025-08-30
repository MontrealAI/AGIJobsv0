const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("JobEscrow ether rejection", function () {
  const { AGIALPHA } = require("../../scripts/constants");
  let owner, employer, operator, token, routing, escrow;

  beforeEach(async () => {
    [owner, employer, operator] = await ethers.getSigners();

    token = await ethers.getContractAt("contracts/v2/AGIALPHAToken.sol:AGIALPHAToken", AGIALPHA);
    await token.mint(employer.address, 1000);

    const Routing = await ethers.getContractFactory(
      "contracts/legacy/MockRoutingModule.sol:MockRoutingModule"
    );
    routing = await Routing.deploy(operator.address);

    const Escrow = await ethers.getContractFactory(
      "contracts/v2/modules/JobEscrow.sol:JobEscrow"
    );
    escrow = await Escrow.deploy(await routing.getAddress());
  });

  it("reverts on direct ether transfer", async () => {
    await expect(
      owner.sendTransaction({ to: await escrow.getAddress(), value: 1 })
    ).to.be.revertedWith("JobEscrow: no ether");
  });

  it("reverts on unknown calldata with value", async () => {
    await expect(
      owner.sendTransaction({
        to: await escrow.getAddress(),
        data: "0x12345678",
        value: 1,
      })
    ).to.be.revertedWith("JobEscrow: no ether");
  });

  it("reports tax exemption for owner and helper", async () => {
    expect(await escrow.isTaxExempt()).to.equal(true);

    const Helper = await ethers.getContractFactory(
      "contracts/legacy/TaxExemptHelper.sol:TaxExemptHelper"
    );
    const helper = await Helper.deploy();
    expect(await helper.check(await escrow.getAddress())).to.equal(true);
  });
});
