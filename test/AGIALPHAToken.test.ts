import { expect } from "chai";
import { ethers } from "hardhat";

describe("AGIALPHAToken", function () {
  it("mints initial supply to deployer and reports 6 decimals", async function () {
    const [owner] = await ethers.getSigners();
    const supply = ethers.parseUnits("1000", 6);
    const Token = await ethers.getContractFactory("AGIALPHAToken");
    const token = await Token.deploy("AGI ALPHA", "AGIALPHA", supply);
    await token.waitForDeployment();

    expect(await token.decimals()).to.equal(6);
    expect(await token.balanceOf(owner.address)).to.equal(supply);
  });

  it("handles transfers using 6 decimal precision", async function () {
    const [owner, user] = await ethers.getSigners();
    const supply = ethers.parseUnits("1", 6); // 1 token
    const Token = await ethers.getContractFactory("AGIALPHAToken");
    const token = await Token.deploy("AGI ALPHA", "AGIALPHA", supply);
    await token.waitForDeployment();

    const amount = ethers.parseUnits("0.25", 6); // 0.25 token
    await token.transfer(user.address, amount);

    expect(await token.balanceOf(user.address)).to.equal(amount);
    expect(await token.balanceOf(owner.address)).to.equal(supply - amount);
  });
});
