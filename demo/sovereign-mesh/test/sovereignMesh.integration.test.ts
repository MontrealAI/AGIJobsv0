import { expect } from "chai";
import { ethers, artifacts } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { AGIALPHA, AGIALPHA_DECIMALS } from "../../../scripts/constants";
import { decodeJobMetadata } from "../../../test/utils/jobMetadata";

enum Role {
  Agent,
  Validator,
  Platform,
}

type HubEnv = {
  stake: any;
  validation: any;
  registry: any;
};

async function configureToken(owner: string) {
  const artifact = await artifacts.readArtifact(
    "contracts/test/AGIALPHAToken.sol:AGIALPHAToken",
  );
  await ethers.provider.send("hardhat_setCode", [AGIALPHA, artifact.deployedBytecode]);
  const ownerSlotValue = ethers.zeroPadValue(owner, 32);
  const ownerSlot = ethers.toBeHex(5, 32);
  await ethers.provider.send("hardhat_setStorageAt", [AGIALPHA, ownerSlot, ownerSlotValue]);
  return ethers.getContractAt(artifact.abi, AGIALPHA, await ethers.getSigner(owner));
}

async function deployHub(
  owner: string,
  validators: string[],
  moderator: string,
): Promise<HubEnv> {
  const Stake = await ethers.getContractFactory("contracts/v2/StakeManager.sol:StakeManager");
  const stake = await Stake.deploy(
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner,
  );

  const Reputation = await ethers.getContractFactory(
    "contracts/v2/ReputationEngine.sol:ReputationEngine",
  );
  const reputation = await Reputation.deploy(await stake.getAddress());

  const Identity = await ethers.getContractFactory(
    "contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle",
  );
  const identity = await Identity.deploy();
  await identity.setResult(true);

  const Validation = await ethers.getContractFactory(
    "contracts/v2/ValidationModule.sol:ValidationModule",
  );
  const validation = await Validation.deploy(
    ethers.ZeroAddress,
    await stake.getAddress(),
    1,
    1,
    3,
    5,
    validators,
  );

  const NFT = await ethers.getContractFactory(
    "contracts/v2/CertificateNFT.sol:CertificateNFT",
  );
  const nft = await NFT.deploy("Cert", "CERT");

  const Registry = await ethers.getContractFactory("contracts/v2/JobRegistry.sol:JobRegistry");
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await nft.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    owner,
  );

  const Dispute = await ethers.getContractFactory(
    "contracts/v2/modules/DisputeModule.sol:DisputeModule",
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    moderator,
    owner,
  );
  await dispute.waitForDeployment();
  await dispute.setStakeManager(await stake.getAddress());

  await stake.setModules(await registry.getAddress(), await dispute.getAddress());
  await validation.setJobRegistry(await registry.getAddress());
  await validation.setIdentityRegistry(await identity.getAddress());
  await validation.setValidatorPool(validators);
  await validation.setValidatorsPerJob(3);
  await validation.setRequiredValidatorApprovals(3);
  await validation.setReputationEngine(await reputation.getAddress());
  await nft.setJobRegistry(await registry.getAddress());
  await nft.setStakeManager(await stake.getAddress());
  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress(),
    ethers.ZeroAddress,
    [],
  );
  await registry.setIdentityRegistry(await identity.getAddress());
  await reputation.setCaller(await registry.getAddress(), true);

  return { stake, validation, registry };
}

async function runLifecycle(
  env: HubEnv,
  token: any,
  actors: {
    employer: any;
    agent: any;
    validators: any[];
  },
  label: string,
) {
  const reward = ethers.parseUnits("100", AGIALPHA_DECIMALS);
  const stakeAmount = ethers.parseUnits("5", AGIALPHA_DECIMALS);

  for (const signer of [actors.agent, ...actors.validators]) {
    await token.connect(signer).approve(await env.stake.getAddress(), stakeAmount);
    const role = signer === actors.agent ? Role.Agent : Role.Validator;
    await env.stake.connect(signer).depositStake(role, stakeAmount);
  }

  await token
    .connect(actors.employer)
    .approve(await env.stake.getAddress(), reward);

  const deadline = BigInt((await time.latest()) + 3600);
  const specHash = ethers.id(`spec-${label}`);
  await env.registry
    .connect(actors.employer)
    .createJob(reward, Number(deadline), specHash, `ipfs://${label}`);

  await env.registry.connect(actors.agent).applyForJob(1, "agent", []);
  const resultUri = `ipfs://${label}/result`;
  const resultHash = ethers.id(resultUri);
  await env.registry
    .connect(actors.agent)
    .submit(1, resultHash, resultUri, "agent", []);

  const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes(`burn-${label}`));
  await env.registry
    .connect(actors.employer)
    .submitBurnReceipt(1, burnTxHash, 0, 0);

  const nonce = await env.validation.jobNonce(1);
  const salts: string[] = [];
  for (const validator of actors.validators) {
    const saltBytes = ethers.randomBytes(32);
    const salt = ethers.hexlify(saltBytes);
    salts.push(salt);
    const commit = ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "uint256", "bool", "bytes32", "bytes32", "bytes32"],
        [1n, nonce, true, burnTxHash, salt, specHash],
      ),
    );
    await env.validation
      .connect(validator)
      .commitValidation(1, commit, "validator", []);
  }

  await time.increase(2);

  for (let i = 0; i < actors.validators.length; i++) {
    const validator = actors.validators[i];
    const salt = salts[i];
    await env.validation
      .connect(validator)
      .revealValidation(1, true, burnTxHash, salt, "validator", []);
  }

  await time.increase(2);
  await env.validation.finalize(1);
  await env.registry.connect(actors.employer).confirmEmployerBurn(1, burnTxHash);
  await env.registry.connect(actors.employer).finalize(1);

  const job = await env.registry.jobs(1);
  const metadata = decodeJobMetadata(job.packedMetadata);
  expect(metadata.state).to.equal(6); // Completed
}

describe("Sovereign Mesh multi-hub orchestration", function () {
  it("finalizes jobs across two hubs", async function () {
    const [owner, employer, agent, v1, v2, v3, moderator] = await ethers.getSigners();
    const token = await configureToken(owner.address);
    const mintAmount = ethers.parseUnits("1000", AGIALPHA_DECIMALS);
    for (const signer of [employer, agent, v1, v2, v3]) {
      await token.mint(signer.address, mintAmount);
    }

    const validatorAddresses = [v1.address, v2.address, v3.address];
    const hubA = await deployHub(owner.address, validatorAddresses, moderator.address);
    const hubB = await deployHub(owner.address, validatorAddresses, moderator.address);

    await runLifecycle(
      hubA,
      token,
      { employer, agent, validators: [v1, v2, v3] },
      "alpha",
    );
    await runLifecycle(
      hubB,
      token,
      { employer, agent, validators: [v1, v2, v3] },
      "beta",
    );
  });
});
