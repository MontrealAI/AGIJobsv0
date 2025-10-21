import { ethers } from 'hardhat';
import fs from 'node:fs';
import path from 'node:path';

interface CultureConfig {
  owner: { address: string };
  arena: {
    baseRewards: { teacher: string; student: string; validator: string };
    committeeSize: number;
    validatorStake: string;
    targetSuccessRate: number;
    minDifficulty: number;
    maxDifficulty: number;
    maxDifficultyStep: number;
  };
  culture: { kinds: string[]; maxCitations: number };
}

function loadArtifact(name: string) {
  const artifactPath = path.join(__dirname, '..', 'out', `${name}.sol`, `${name}.json`);
  const fallbackPath = path.join(__dirname, '..', 'artifacts', `${name}.json`);
  const payload = fs.existsSync(artifactPath) ? fs.readFileSync(artifactPath, 'utf-8') : fs.readFileSync(fallbackPath, 'utf-8');
  return JSON.parse(payload);
}

async function main() {
  const configPath = path.join(__dirname, '..', 'config', 'culture.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as CultureConfig;

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying CULTURE stack with ${deployer.address}`);

  const cultureArtifact = loadArtifact('CultureRegistry');
  const cultureFactory = new ethers.ContractFactory(cultureArtifact.abi, cultureArtifact.bytecode, deployer);
  const identityRegistry = process.env.IDENTITY_REGISTRY ?? ethers.ZeroAddress;
  const cultureContract = await cultureFactory.deploy(config.owner.address, identityRegistry, config.culture.kinds, config.culture.maxCitations);
  await cultureContract.waitForDeployment();
  console.log(`CultureRegistry deployed at ${await cultureContract.getAddress()}`);

  const arenaArtifact = loadArtifact('SelfPlayArena');
  const arenaFactory = new ethers.ContractFactory(arenaArtifact.abi, arenaArtifact.bytecode, deployer);
  const arena = await arenaFactory.deploy(
    config.owner.address,
    identityRegistry,
    config.arena.baseRewards.teacher,
    config.arena.baseRewards.student,
    config.arena.baseRewards.validator,
    config.arena.committeeSize,
    config.arena.validatorStake,
    Math.round(config.arena.targetSuccessRate * 10_000)
  );
  await arena.waitForDeployment();
  console.log(`SelfPlayArena deployed at ${await arena.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
