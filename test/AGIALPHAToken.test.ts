import { expect } from "chai";
import { ethers } from "hardhat";

describe("AGIALPHAToken", function () {
  it("uses 6 decimals and allows owner mint/burn", async function () {
    const [owner, user] = await ethers.getSigners();
    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    const token = await Token.deploy(owner.address);

    await token.mint(user.address, 1_000_000); // 1 token
    expect(await token.decimals()).to.equal(6);
    expect(await token.balanceOf(user.address)).to.equal(1_000_000);

    await token.burn(user.address, 400_000);
    expect(await token.balanceOf(user.address)).to.equal(600_000);
  });

  it("prevents non-owner minting", async function () {
    const [owner, user] = await ethers.getSigners();
    const Token = await ethers.getContractFactory(
      "contracts/v2/AGIALPHAToken.sol:AGIALPHAToken"
    );
    const token = await Token.deploy(owner.address);
    await expect(
      token.connect(user).mint(user.address, 1)
    ).to.be.reverted;
  });
});
