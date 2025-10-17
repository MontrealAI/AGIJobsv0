import { ethers } from "ethers";

export const prepareCommitSalt = (salt?: string) => {
  if (salt && ethers.isHexString(salt, 32)) {
    return { salt };
  }
  return { salt: ethers.hexlify(ethers.randomBytes(32)) };
};
