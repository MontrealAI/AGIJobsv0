#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { artifacts, ethers } from 'hardhat';

async function main() {
  const configPath = path.join('config', 'agialpha.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing AGIALPHA config at ${configPath}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    address: string;
  };
  const target = ethers.getAddress(config.address);
  const code = await ethers.provider.getCode(target);
  if (code !== '0x') {
    console.log(`AGIALPHA already deployed at ${target}`);
    return;
  }
  const artifact = await artifacts.readArtifact(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
  );
  await ethers.provider.send('hardhat_setCode', [
    target,
    artifact.deployedBytecode,
  ]);
  const [owner] = await ethers.getSigners();
  const ownerSlot = ethers.toBeHex(5, 32);
  const ownerValue = ethers.zeroPadValue(owner.address, 32);
  await ethers.provider.send('hardhat_setStorageAt', [
    target,
    ownerSlot,
    ownerValue,
  ]);
  console.log(`Injected mock AGIALPHA at ${target} with owner ${owner.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
