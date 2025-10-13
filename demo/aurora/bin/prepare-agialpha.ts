#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

const TOKEN_ADDRESS = '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA';

async function setCode(provider: ethers.JsonRpcProvider, bytecode: string): Promise<void> {
  try {
    await provider.send('anvil_setCode', [TOKEN_ADDRESS, bytecode]);
    return;
  } catch (anvilError) {
    try {
      await provider.send('hardhat_setCode', [TOKEN_ADDRESS, bytecode]);
      return;
    } catch (hardhatError) {
      throw new Error(
        `Unable to inject AGIALPHA bytecode: ${(anvilError as Error).message}; ${(hardhatError as Error).message}`
      );
    }
  }
}

async function setStorage(
  provider: ethers.JsonRpcProvider,
  slot: string,
  value: string
): Promise<void> {
  try {
    await provider.send('anvil_setStorageAt', [TOKEN_ADDRESS, slot, value]);
  } catch (anvilError) {
    try {
      await provider.send('hardhat_setStorageAt', [TOKEN_ADDRESS, slot, value]);
    } catch (hardhatError) {
      throw new Error(
        `Unable to set storage: ${(anvilError as Error).message}; ${(hardhatError as Error).message}`
      );
    }
  }
}

async function main(): Promise<void> {
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const ownerKey = process.env.PRIVATE_KEY;
  if (!ownerKey) {
    throw new Error('PRIVATE_KEY is required to prepare AGIALPHA token.');
  }
  const owner = new ethers.Wallet(ownerKey, provider);

  const artifactPath = path.join(
    'artifacts',
    'contracts/test/AGIALPHAToken.sol',
    'AGIALPHAToken.json'
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`AGIALPHAToken artifact missing at ${artifactPath}. Compile contracts first.`);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  const currentCode = await provider.getCode(TOKEN_ADDRESS);
  if (currentCode === '0x') {
    console.log('⚙️  Injecting AGIALPHA token bytecode on local network...');
    await setCode(provider, artifact.deployedBytecode);
    const ownerSlot = ethers.toBeHex(5, 32);
    const ownerValue = ethers.zeroPadValue(owner.address, 32);
    await setStorage(provider, ownerSlot, ownerValue);
  }

  const token = new ethers.Contract(TOKEN_ADDRESS, artifact.abi, owner);

  const wallets = new Map<string, ethers.Wallet>();
  const register = (key: string | undefined) => {
    if (!key) return;
    const wallet = new ethers.Wallet(key, provider);
    if (!wallets.has(wallet.address)) {
      wallets.set(wallet.address, wallet);
    }
  };

  register(ownerKey);
  register(process.env.WORKER_PRIVATE_KEY);
  register(process.env.VALIDATOR_PRIVATE_KEY);

  const mintAmount = ethers.parseUnits('1000', 18);
  for (const [addr, wallet] of wallets.entries()) {
    const balance: bigint = await token.balanceOf(addr);
    if (balance < mintAmount / 10n) {
      console.log(`💠 Minting AGIALPHA to ${addr}`);
      const tx = await token.mint(addr, mintAmount);
      await tx.wait();
    }
    if (!(await token.hasAcknowledged(addr))) {
      await token.connect(wallet).acceptTerms().catch(() => undefined);
    }
  }

  console.log('AGIALPHA token ready at', TOKEN_ADDRESS);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
