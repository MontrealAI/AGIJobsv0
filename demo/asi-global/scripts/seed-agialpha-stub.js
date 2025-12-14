#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const AGIALPHA_ADDRESS = '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA';
const RPC_URL = process.env.AGI_RPC_URL || 'http://127.0.0.1:8545';
const artifactPath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'artifacts',
  'contracts',
  'v2',
  'mocks',
  'LocalAgialpha.sol',
  'LocalAgialpha.json'
);

if (!fs.existsSync(artifactPath)) {
  console.error(`Artifact not found at ${artifactPath}. Run 'npx hardhat compile' first.`);
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const provider = new ethers.JsonRpcProvider(RPC_URL);

async function main() {
  const signer = await provider.getSigner();
  const code = await provider.getCode(AGIALPHA_ADDRESS);
  if (code !== '0x') {
    console.log(`AGIALPHA stub already deployed at ${AGIALPHA_ADDRESS}`);
  } else {
    const rpcMethods = ['anvil_setCode', 'hardhat_setCode'];
    let injected = false;

    for (const method of rpcMethods) {
      try {
        await provider.send(method, [AGIALPHA_ADDRESS, artifact.deployedBytecode]);
        console.log(
          `Injected LocalAgialpha bytecode at ${AGIALPHA_ADDRESS} via ${method}`
        );
        injected = true;
        break;
      } catch (err) {
        console.warn(`RPC ${method} failed: ${err.message || err}`);
      }
    }

    if (!injected) {
      throw new Error(
        'Unable to inject LocalAgialpha bytecode: supported RPC method not found.'
      );
    }
  }

  const token = new ethers.Contract(AGIALPHA_ADDRESS, artifact.abi, signer);
  const supply = await token.totalSupply();
  if (supply === 0n) {
    const mintAmount = ethers.parseUnits('1000000000', 18);
    const tx = await token.mint(await signer.getAddress(), mintAmount);
    await tx.wait();
    console.log(`Minted ${mintAmount.toString()} wei to ${await signer.getAddress()}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
