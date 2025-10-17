import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { AGIALPHA } from "../../../scripts/constants";
import { ensureAgialphaStub } from "../shared/ensureAgialpha";
import { extractDeployedAddresses } from "../shared/deployUtils";

const ZERO_IDENTITY = {
  ens: ethers.ZeroAddress,
  nameWrapper: ethers.ZeroAddress,
  clubRootNode: ethers.ZeroHash,
  agentRootNode: ethers.ZeroHash,
  validatorMerkleRoot: ethers.ZeroHash,
  agentMerkleRoot: ethers.ZeroHash
};

const ECON_DEFAULTS = {
  feePct: 0,
  burnPct: 0,
  employerSlashPct: 0,
  treasurySlashPct: 0,
  validatorSlashRewardPct: 0,
  commitWindow: 60,
  revealWindow: 60,
  minStake: 0,
  jobStake: 0
};

async function deployHub(governance: string) {
  await ensureAgialphaStub();
  const Deployer = await ethers.getContractFactory("contracts/v2/Deployer.sol:Deployer");
  const deployer = await Deployer.deploy();
  await deployer.waitForDeployment();
  const tx = await deployer["deployWithoutTaxPolicy"](
    ECON_DEFAULTS,
    ZERO_IDENTITY,
    governance
  );
  const receipt = await tx.wait();
  const deployed = extractDeployedAddresses(deployer.interface, receipt.logs);

  const stake = await ethers.getContractAt(
    "contracts/v2/StakeManager.sol:StakeManager",
    deployed.stake
  );
  const job = await ethers.getContractAt(
    "contracts/v2/JobRegistry.sol:JobRegistry",
    deployed.job
  );
  const validation = await ethers.getContractAt(
    "contracts/v2/ValidationModule.sol:ValidationModule",
    deployed.validation
  );
  const dispute = await ethers.getContractAt(
    "contracts/v2/modules/DisputeModule.sol:DisputeModule",
    deployed.dispute
  );
  const certificate = await ethers.getContractAt(
    "contracts/v2/CertificateNFT.sol:CertificateNFT",
    deployed.certificate
  );
  const identity = await ethers.getContractAt(
    "contracts/v2/IdentityRegistry.sol:IdentityRegistry",
    deployed.identityRegistry
  );
  const systemPause = await ethers.getContractAt(
    "contracts/v2/SystemPause.sol:SystemPause",
    deployed.systemPause
  );
  if ((await identity.pendingOwner())?.toLowerCase() === governance.toLowerCase()) {
    const ownerSigner = await ethers.getSigner(governance);
    await identity.connect(ownerSigner).acceptOwnership();
  }

  return { stake, job, validation, dispute, certificate, identity, systemPause } as const;
}

async function ensureValidatorSelection(
  validation: ethers.Contract,
  jobId: bigint,
  contributors: ethers.Signer[]
) {
  const round = await validation.rounds(jobId);
  if (round.commitDeadline !== 0n) {
    return;
  }
  const baseEntropy = 0n;
  const callSelect = async (signer: ethers.Signer, entropy: bigint) => {
    try {
      await validation.connect(signer).selectValidators(jobId, entropy);
    } catch (error: any) {
      const data = error?.data ?? error?.error?.data;
      if (data) {
        try {
          const parsed = validation.interface.parseError(data);
          if (parsed?.name === "ValidatorsAlreadySelected") {
            return;
          }
        } catch {
          // ignore parse issues
        }
      }
      throw error;
    }
  };
  if (contributors.length === 0) {
    throw new Error("contributors required");
  }
  await callSelect(contributors[0], baseEntropy);
  for (let i = 1; i < contributors.length; i += 1) {
    await callSelect(contributors[i], baseEntropy + BigInt(i));
  }
  let target = await validation.selectionBlock(jobId);
  let current = await ethers.provider.getBlockNumber();
  while (BigInt(current) <= BigInt(target)) {
    await ethers.provider.send("evm_mine", []);
    current = await ethers.provider.getBlockNumber();
  }
  await callSelect(contributors[0], baseEntropy);
}

async function computeCommitHash(
  hub: { validation: ethers.Contract; job: ethers.Contract },
  jobId: bigint,
  validator: string,
  approve: boolean,
  salt: string
) {
  const nonce = await hub.validation.jobNonce(jobId);
  const specHash = await hub.job.getSpecHash(jobId);
  const burnTx = ethers.ZeroHash;
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const outcomeHash = ethers.keccak256(
    coder.encode(["uint256", "bytes32", "bool", "bytes32"], [nonce, specHash, approve, burnTx])
  );
  const domain = await hub.validation.DOMAIN_SEPARATOR();
  const network = await ethers.provider.getNetwork();
  return ethers.keccak256(
    coder.encode(
      ["uint256", "bytes32", "bytes32", "address", "uint256", "bytes32"],
      [jobId, outcomeHash, salt, validator, network.chainId, domain]
    )
  );
}


describe("Sovereign Mesh mission flow", function () {
  it("runs commit/reveal/finalize across two hubs", async function () {
    const [employer, agent, v1, v2, v3] = await ethers.getSigners();
    const employerAddr = await employer.getAddress();

    const hubA = await deployHub(employerAddr);
    const hubB = await deployHub(employerAddr);

    const token = await ethers.getContractAt(
      "contracts/test/MockERC20.sol:MockERC20",
      AGIALPHA
    );

    const validators = [v1, v2, v3];
    const validatorAddresses = validators.map((v) => v.address);
    const agentSubdomain = "agent.mesh";
    const validatorSubdomain = "validator.mesh";

    for (const hub of [hubA, hubB]) {
      await hub.identity.connect(employer).addAdditionalAgent(agent.address);
    for (const validator of validators) {
      await hub.identity
        .connect(employer)
        .addAdditionalValidator(validator.address);
    }
      const validationAddr = await hub.validation.getAddress();
      const setValidationModuleData = hub.stake.interface.encodeFunctionData(
        "setValidationModule",
        [validationAddr]
      );
      await hub.systemPause
        .connect(employer)
        .executeGovernanceCall(await hub.stake.getAddress(), setValidationModuleData);
      const setPoolData = hub.validation.interface.encodeFunctionData(
        "setValidatorPool",
        [validatorAddresses]
      );
      await hub.systemPause
        .connect(employer)
        .executeGovernanceCall(await hub.validation.getAddress(), setPoolData);
    }

    const mintAmount = ethers.parseEther("5");
    for (const wallet of [employer, agent, ...validators]) {
      await token.mint(wallet.address, mintAmount);
    }

    const stakeAmount = ethers.parseEther("1");
    for (const validator of validators) {
      await token.connect(validator).approve(await hubA.stake.getAddress(), stakeAmount);
      await hubA.stake.connect(validator).depositStake(1, stakeAmount);
      await token.connect(validator).approve(await hubB.stake.getAddress(), stakeAmount);
      await hubB.stake.connect(validator).depositStake(1, stakeAmount);
    }

    const agentStake = ethers.parseEther("1");
    for (const hub of [hubA, hubB]) {
      const stakeAddr = await hub.stake.getAddress();
      await token.connect(agent).approve(stakeAddr, agentStake);
      await hub.stake.connect(agent).depositStake(0, agentStake);
    }

    const reward = ethers.parseEther("1");
    const deadlineA = Math.floor(Date.now() / 1000) + 3600;
    const deadlineB = Math.floor(Date.now() / 1000) + 3600;

    const stakeAddrA = await hubA.stake.getAddress();
    const feePctA = await hubA.job.feePct();
    const jobStakeA = await hubA.job.jobStake();
    const approvalA = reward + (reward * feePctA) / 100n + jobStakeA;
    await token.connect(employer).approve(stakeAddrA, approvalA);
    const specA = ethers.id("mesh-hub-a");
    const txA = await hubA.job
      .connect(employer)
      .createJob(reward, deadlineA, specA, "ipfs://mesh/hub-a");
    const rcA = await txA.wait();
    const jobIdA = rcA!.logs.find((log) => log.fragment?.name === "JobCreated")!.args!.jobId;
    await hubA.job
      .connect(agent)
      .applyForJob(jobIdA, agentSubdomain, []);
    await (
      await hubA.job
        .connect(agent)
        .submit(
          jobIdA,
          ethers.id("hub-a-result"),
          "ipfs://mesh/hub-a/result",
          agentSubdomain,
          []
        )
    ).wait();
    await ensureValidatorSelection(hubA.validation, jobIdA, [employer, agent]);

    const stakeAddrB = await hubB.stake.getAddress();
    const feePctB = await hubB.job.feePct();
    const jobStakeB = await hubB.job.jobStake();
    const approvalB = reward + (reward * feePctB) / 100n + jobStakeB;
    await token.connect(employer).approve(stakeAddrB, approvalB);
    const specB = ethers.id("mesh-hub-b");
    const txB = await hubB.job
      .connect(employer)
      .createJob(reward, deadlineB, specB, "ipfs://mesh/hub-b");
    const rcB = await txB.wait();
    const jobIdB = rcB!.logs.find((log) => log.fragment?.name === "JobCreated")!.args!.jobId;
    await hubB.job
      .connect(agent)
      .applyForJob(jobIdB, agentSubdomain, []);
    await (
      await hubB.job
        .connect(agent)
        .submit(
          jobIdB,
          ethers.id("hub-b-result"),
          "ipfs://mesh/hub-b/result",
          agentSubdomain,
          []
        )
    ).wait();
    await ensureValidatorSelection(hubB.validation, jobIdB, [employer, agent]);

    const salts = [ethers.id("salt1"), ethers.id("salt2"), ethers.id("salt3")];
    for (const [index, validator] of validators.entries()) {
      const commitHashA = await computeCommitHash(
        hubA,
        jobIdA,
        await validator.getAddress(),
        true,
        salts[index]
      );
      await hubA.validation
        .connect(validator)
        .commitValidation(jobIdA, commitHashA, validatorSubdomain, []);
      const commitHashB = await computeCommitHash(
        hubB,
        jobIdB,
        await validator.getAddress(),
        true,
        salts[index]
      );
      await hubB.validation
        .connect(validator)
        .commitValidation(jobIdB, commitHashB, validatorSubdomain, []);
    }

    await time.increase(61);

    for (const [index, validator] of validators.entries()) {
      await hubA.validation
        .connect(validator)
        .revealValidation(
          jobIdA,
          true,
          ethers.ZeroHash,
          salts[index],
          validatorSubdomain,
          []
        );
      await hubB.validation
        .connect(validator)
        .revealValidation(
          jobIdB,
          true,
          ethers.ZeroHash,
          salts[index],
          validatorSubdomain,
          []
        );
    }

    await Promise.all([
      hubA.validation.finalize(jobIdA).then((tx) => tx.wait()),
      hubB.validation.finalize(jobIdB).then((tx) => tx.wait())
    ]);

    const remaining = await token.balanceOf(employer.address);
    const expectedSpent =
      reward + (reward * feePctA) / 100n + reward + (reward * feePctB) / 100n;
    expect(remaining).to.equal(mintAmount - expectedSpent);
  });
});
