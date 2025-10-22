import type { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import {
  ArtifactSeed,
  AgentSeed,
  confirmBytecode,
  ensureAddress,
  loadCultureConfig,
  saveCultureConfig,
  resolvePrivateKey,
  resolveSigner,
  toBytes32Array,
} from './culture/utils';

function normaliseAddress(value: string): string {
  return ethers.getAddress(value.trim());
}

async function ensureAgent(
  identity: any,
  agent: AgentSeed,
  kind: 'agent' | 'validator'
): Promise<void> {
  const target = normaliseAddress(agent.address);
  if (kind === 'agent') {
    const allowed = await identity.additionalAgents(target);
    if (!allowed) {
      const tx = await identity.addAdditionalAgent(target);
      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error(`Failed to register additional agent ${target}`);
      }
      console.log(`✅ Registered additional agent ${target}`);
    }
  } else {
    const allowed = await identity.additionalValidators(target);
    if (!allowed) {
      const tx = await identity.addAdditionalValidator(target);
      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error(`Failed to register additional validator ${target}`);
      }
      console.log(`✅ Registered additional validator ${target}`);
    }
  }
  if (agent.profileURI) {
    const existing = await identity.agentProfileURI(target);
    if (existing !== agent.profileURI) {
      const tx = await identity.setAgentProfileURI(target, agent.profileURI);
      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error(`Failed to set profile URI for ${target}`);
      }
      console.log(`📝 Updated profile URI for ${target}`);
    }
  }
}

async function configureOrchestrators(arena: any, orchestrators: string[]): Promise<void> {
  if (!orchestrators.length) {
    return;
  }
  for (const entry of orchestrators) {
    const addr = normaliseAddress(entry);
    const allowed = await arena.orchestrators(addr);
    if (!allowed) {
      const tx = await arena.setOrchestrator(addr, true);
      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error(`Failed to authorise orchestrator ${addr}`);
      }
      console.log(`🎛️ Authorised orchestrator ${addr}`);
    }
  }
}

async function mintArtifacts(
  culture: any,
  artifacts: ArtifactSeed[]
): Promise<number[]> {
  const mintedIds: number[] = [];
  for (const artifact of artifacts) {
    const parentId = artifact.parentId ?? 0;
    const citations = artifact.citations ?? [];
    const proof = artifact.proof ? toBytes32Array(artifact.proof) : [];
    const tx = await culture.mintArtifact(
      artifact.kind,
      artifact.uri,
      parentId,
      citations,
      artifact.subdomain ?? '',
      proof
    );
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Artifact mint transaction failed for ${artifact.uri}`);
    }
    const parsed = receipt.logs
      .map((log: any) => {
        try {
          return culture.interface.parseLog(log);
        } catch (error) {
          return null;
        }
      })
      .find((entry: any) => entry && entry.name === 'ArtifactMinted');
    if (!parsed) {
      throw new Error('Unable to locate ArtifactMinted event in transaction receipt');
    }
    const artifactId = Number(parsed.args.artifactId);
    mintedIds.push(artifactId);
    console.log(
      `✨ Minted ${artifact.kind} artifact ${artifactId} for ${parsed.args.author} (parent ${parentId}, citations: ${citations.length})`
    );
  }
  return mintedIds;
}

async function fundFeePool(
  feePoolAddress: string,
  amount: bigint,
  tokenAddress: string,
  contributorSigner: any
): Promise<void> {
  const erc20 = new ethers.Contract(
    tokenAddress,
    [
      'function decimals() view returns (uint8)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)',
    ],
    contributorSigner
  );
  const feePool = await ethers.getContractAt('contracts/v2/FeePool.sol:FeePool', feePoolAddress, contributorSigner);
  let decimals = 18;
  try {
    decimals = await erc20.decimals();
  } catch (error) {
    console.warn('⚠️ Unable to query token decimals; defaulting to 18');
  }
  console.log(`💰 Preparing to contribute ${ethers.formatUnits(amount, decimals)} tokens to FeePool ${feePoolAddress}`);
  const allowance = await erc20.allowance(await contributorSigner.getAddress(), feePoolAddress);
  if (allowance < amount) {
    const approveTx = await erc20.approve(feePoolAddress, amount);
    const approveReceipt = await approveTx.wait(1);
    if (!approveReceipt || approveReceipt.status !== 1) {
      throw new Error('Failed to approve FeePool allowance');
    }
    console.log('✅ Approved FeePool allowance');
  }
  const tx = await feePool.contribute(amount);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error('FeePool contribution transaction failed');
  }
  console.log('🎉 FeePool funded successfully');
}

async function resolveSignerForAddress(
  expected: string,
  options: { envVar: string; vaultVar: string; fallbackIndex?: number; label: string }
): Promise<Wallet> {
  const signer = await resolveSigner(ethers.provider, options);
  const signerAddress = await signer.getAddress();
  if (signerAddress.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `${options.label} signer (${signerAddress}) does not match expected address ${expected}. Provide the correct key via environment variables.`
    );
  }
  return signer;
}

async function main(): Promise<void> {
  const config = await loadCultureConfig();
  const cultureAddress = config.contracts?.cultureRegistry ?? (config.dependencies as any).cultureRegistry;
  const arenaAddress = config.contracts?.selfPlayArena ?? (config.dependencies as any).selfPlayArena;
  if (!cultureAddress || !arenaAddress) {
    throw new Error('CultureRegistry and SelfPlayArena addresses must be present in config/culture.json before seeding.');
  }

  const cultureRegistry = ensureAddress('contracts.cultureRegistry', cultureAddress);
  const arenaContractAddress = ensureAddress('contracts.selfPlayArena', arenaAddress);
  const identityRegistryAddress = ensureAddress('dependencies.identityRegistry', config.dependencies.identityRegistry);
  const feePoolAddress = ensureAddress('dependencies.feePool', config.dependencies.feePool);

  await confirmBytecode('CultureRegistry', cultureRegistry);
  await confirmBytecode('SelfPlayArena', arenaContractAddress);
  await confirmBytecode('IdentityRegistry', identityRegistryAddress);
  await confirmBytecode('FeePool', feePoolAddress);

  const ownerAddress = ensureAddress('owner.address', config.owner.address);
  const ownerSigner = await resolveSignerForAddress(ownerAddress, {
    envVar: 'CULTURE_OWNER_KEY',
    vaultVar: 'CULTURE_OWNER_VAULT_PATH',
    fallbackIndex: 0,
    label: 'Culture owner',
  });

  const identity = await ethers.getContractAt(
    'contracts/v2/IdentityRegistry.sol:IdentityRegistry',
    identityRegistryAddress,
    ownerSigner
  );
  const culture = await ethers.getContractAt(
    'contracts/v2/CultureRegistry.sol:CultureRegistry',
    cultureRegistry,
    ownerSigner
  );
  const arena = await ethers.getContractAt(
    'contracts/v2/SelfPlayArena.sol:SelfPlayArena',
    arenaContractAddress,
    ownerSigner
  );

  const agents = config.seed?.agents;
  if (agents) {
    const authorSeeds = agents.authors ?? [];
    for (const seed of authorSeeds) {
      await ensureAgent(identity, seed, 'agent');
    }
    const teacherSeeds = agents.teachers ?? [];
    for (const seed of teacherSeeds) {
      await ensureAgent(identity, seed, 'agent');
    }
    const studentSeeds = agents.students ?? [];
    for (const seed of studentSeeds) {
      await ensureAgent(identity, seed, 'agent');
    }
    const validatorSeeds = agents.validators ?? [];
    for (const seed of validatorSeeds) {
      await ensureAgent(identity, seed, 'validator');
    }
    const orchestrators = agents.orchestrators ?? [];
    await configureOrchestrators(arena, orchestrators);
  }

  const artifacts = config.seed?.artifacts ?? [];
  if (artifacts.length > 0) {
    const minted = await mintArtifacts(culture, artifacts);
    for (let i = 0; i < artifacts.length; i += 1) {
      artifacts[i].mintedId = minted[i];
    }
    config.seed!.artifacts = artifacts;
  }

  const funding = config.seed?.feePool;
  if (funding) {
    const contributorAddress = normaliseAddress(funding.contributor);
    if (!funding.token) {
      console.warn('⚠️ Skipping FeePool funding because no ERC20 token address is configured.');
    } else {
      const tokenAddress = ensureAddress('seed.feePool.token', funding.token);
      const contributorKey =
        (await resolvePrivateKey('CULTURE_FEEPOOL_FUNDING_KEY', 'CULTURE_FEEPOOL_FUNDING_VAULT_PATH')) ??
        (await resolvePrivateKey('CULTURE_OWNER_KEY', 'CULTURE_OWNER_VAULT_PATH'));
      let contributorSigner: any = null;
      if (contributorKey) {
        contributorSigner = new ethers.Wallet(contributorKey, ethers.provider);
      } else {
        const candidates = await ethers.getSigners();
        for (const candidate of candidates) {
          if ((await candidate.getAddress()).toLowerCase() === contributorAddress.toLowerCase()) {
            contributorSigner = candidate;
            break;
          }
        }
      }
      if (!contributorSigner) {
        throw new Error(
          'Unable to resolve signer for fee pool funding. Set CULTURE_FEEPOOL_FUNDING_KEY or run on Hardhat with an unlocked account.'
        );
      }
      const resolvedAddress = (await contributorSigner.getAddress()).toLowerCase();
      if (resolvedAddress !== contributorAddress.toLowerCase()) {
        throw new Error(
          `Resolved contributor signer ${resolvedAddress} does not match configured address ${contributorAddress}`
        );
      }
      await fundFeePool(feePoolAddress, BigInt(funding.amount), tokenAddress, contributorSigner);
    }
  }

  await saveCultureConfig(config);
  console.log('🌱 Culture seed complete');
}

main().catch((error) => {
  console.error('Culture seeding failed:', error);
  process.exitCode = 1;
});
