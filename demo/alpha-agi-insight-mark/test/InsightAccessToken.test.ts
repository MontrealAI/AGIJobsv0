import { expect } from "chai";
import { ethers } from "hardhat";

import type { InsightAccessToken } from "../typechain-types";

describe("InsightAccessToken", () => {
  let owner: any;
  let sentinel: any;
  let recipient: any;
  let token: InsightAccessToken;

  beforeEach(async () => {
    [owner, sentinel, recipient] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("InsightAccessToken");
    token = (await factory.deploy(owner.address)) as unknown as InsightAccessToken;
    await token.waitForDeployment();
  });

  it("supports owner minting and sentinel pause", async () => {
    await token.mint(owner.address, ethers.parseUnits("100", 18));
    await token.setSystemPause(sentinel.address);

    await token.connect(sentinel).pause();
    await expect(token.transfer(recipient.address, ethers.parseUnits("1", 18))).to.be.revertedWithCustomError(
      token,
      "EnforcedPause"
    );

    await token.unpause();
    await token.transfer(recipient.address, ethers.parseUnits("10", 18));
    expect(await token.balanceOf(recipient.address)).to.equal(ethers.parseUnits("10", 18));
  });
});
