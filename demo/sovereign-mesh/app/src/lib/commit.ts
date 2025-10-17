import { ethers } from "ethers";

export const computeCommit = (approve: boolean, salt?: string) => {
  const saltValue = salt && salt.startsWith("0x") ? salt : ethers.hexlify(ethers.randomBytes(32));
  const commitHash = ethers.keccak256(
    ethers.solidityPacked(["bool", "bytes32"], [approve, saltValue])
  );
  return { commitHash, salt: saltValue };
};
