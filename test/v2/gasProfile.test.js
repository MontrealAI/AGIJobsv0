const { expect } = require("chai");
const { ethers } = require("hardhat");

// basic gas profiling to ensure large validator pools do not run OOG
// uses simple ValidationStub for deterministic behaviour

describe("gas profiling", function () {
  it("handles large validator pools without OOG", async () => {
    const signers = await ethers.getSigners();
    const validators = signers.slice(0, 20).map((s) => s.address);

    const Validation = await ethers.getContractFactory(
      "contracts/v2/mocks/ValidationStub.sol:ValidationStub"
    );
    const validation = await Validation.deploy();
    await validation.setValidators(validators);
    await validation.setResult(true);

    const tx = await validation.finalize(1);
    const receipt = await tx.wait();
    // 5M gas safety threshold
    expect(receipt.gasUsed).to.be.lt(5000000n);
  });
});
