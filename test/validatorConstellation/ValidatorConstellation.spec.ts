import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { namehash, solidityPackedKeccak256 } from "ethers";

function buildMerkle(leaves: string[]) {
  const layers: string[][] = [];
  layers.push(leaves);
  while (layers[layers.length - 1].length > 1) {
    const current = layers[layers.length - 1];
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : current[i];
      const [a, b] = left.toLowerCase() < right.toLowerCase() ? [left, right] : [right, left];
      next.push(solidityPackedKeccak256(["bytes32", "bytes32"], [a, b]));
    }
    layers.push(next);
  }
  const root = layers[layers.length - 1][0];
  function getProof(leaf: string) {
    const proof: string[] = [];
    let index = layers[0].indexOf(leaf);
    if (index === -1) {
      throw new Error("Leaf not found");
    }
    for (let level = 0; level < layers.length - 1; level++) {
      const layer = layers[level];
      const isRight = index % 2 === 1;
      const pairIndex = isRight ? index - 1 : index + 1;
      const pair = pairIndex < layer.length ? layer[pairIndex] : layer[index];
      proof.push(pair);
      index = Math.floor(index / 2);
    }
    return proof;
  }
  return { root, getProof };
}

async function deployFixture() {
  const [operator, treasury, watcher, validatorA, validatorB, validatorC, outsider] =
    await ethers.getSigners();

  const DomainAccess = await ethers.getContractFactory(
    "contracts/demo/validator/DomainAccessController.sol:DomainAccessController"
  );
  const domainAccess = await DomainAccess.deploy();
  await domainAccess.waitForDeployment();

  const StakeManager = await ethers.getContractFactory(
    "contracts/demo/validator/StakeManager.sol:StakeManager"
  );
  const stakeManager = await StakeManager.deploy(await treasury.getAddress(), ethers.parseEther("5"));
  await stakeManager.waitForDeployment();

  const ENSAuthorizer = await ethers.getContractFactory(
    "contracts/demo/validator/ENSAuthorizer.sol:ENSAuthorizer"
  );
  const ensAuthorizer = await ENSAuthorizer.deploy();
  await ensAuthorizer.waitForDeployment();

  const ZkVerifier = await ethers.getContractFactory(
    "contracts/demo/validator/ZkBatchVerifier.sol:ZkBatchVerifier"
  );
  const zkVerifier = await ZkVerifier.deploy(1000);
  await zkVerifier.waitForDeployment();

  const Sentinel = await ethers.getContractFactory(
    "contracts/demo/validator/SentinelGuardian.sol:SentinelGuardian"
  );
  const sentinel = await Sentinel.deploy(domainAccess.getAddress());
  await sentinel.waitForDeployment();

  await domainAccess.connect(operator).setSentinel(sentinel.getAddress(), true);
  await sentinel.connect(operator).configureWatcher(await watcher.getAddress(), true, "watcher-1");

  const config = {
    commitWindow: 120,
    revealWindow: 120,
    quorumBps: 6000,
    incorrectVotePenaltyBps: 2000,
    missedRevealPenaltyBps: 4000,
    defaultCommitteeSize: 3,
    entropySalt: ethers.id("CONSTELLATION_ENTROPY"),
    zkSalt: ethers.id("CONSTELLATION_ZK"),
  };

  const ValidatorConstellation = await ethers.getContractFactory(
    "contracts/demo/validator/ValidatorConstellation.sol:ValidatorConstellation"
  );
  const constellation = await ValidatorConstellation.deploy(
    stakeManager.getAddress(),
    ensAuthorizer.getAddress(),
    domainAccess.getAddress(),
    zkVerifier.getAddress(),
    config
  );
  await constellation.waitForDeployment();

  await stakeManager.connect(operator).configureSlashingAuthority(constellation.getAddress(), true);
  await constellation.connect(operator).setCoordinator(await operator.getAddress(), true);

  return {
    operator,
    treasury,
    watcher,
    validatorA,
    validatorB,
    validatorC,
    outsider,
    stakeManager,
    ensAuthorizer,
    domainAccess,
    sentinel,
    zkVerifier,
    constellation,
    config,
  };
}

describe("Validator Constellation demo", () => {
  it("runs a full validation round with zk batching, sentinel pause, and slashing", async () => {
    const {
      operator,
      watcher,
      validatorA,
      validatorB,
      validatorC,
      stakeManager,
      ensAuthorizer,
      domainAccess,
      sentinel,
      constellation,
      config,
    } = await loadFixture(deployFixture);

    const validators = [validatorA, validatorB, validatorC];
    const validatorAddresses = await Promise.all(validators.map((s) => s.getAddress()));
    const ensNames = ["orion.club.agi.eth", "deneb.club.agi.eth", "lyra.alpha.club.agi.eth"];
    const leaves = validatorAddresses.map((addr, idx) => {
      const nh = namehash(ensNames[idx]);
      return solidityPackedKeccak256(["address", "bytes32"], [addr, nh]);
    });
    const tree = buildMerkle(leaves);

    await ensAuthorizer
      .connect(operator)
      .setRoot(0, false, tree.root, "Validator root");
    await ensAuthorizer
      .connect(operator)
      .setRoot(0, true, tree.root, "Validator alpha root");

    for (let i = 0; i < validators.length; i++) {
      await stakeManager
        .connect(validators[i])
        .depositStake(validatorAddresses[i], { value: ethers.parseEther("10") });
      await constellation
        .connect(validators[i])
        .registerValidator(ensNames[i], namehash(ensNames[i]), ensNames[i].includes(".alpha."), tree.getProof(leaves[i]));
    }

    const domain = ethers.id("compute-domain");
    const jobBatchId = ethers.id("batch-1000");
    const jobsRoot = ethers.id("jobs-root");

    await constellation
      .connect(operator)
      .startValidationRound(domain, jobBatchId, jobsRoot, 3, ethers.id("entropy-seed"));
    const roundId = Number((await constellation.nextRoundId()) - 1n);
    const committee = await constellation.roundCommittee(roundId);

    const saltMap: Record<string, string> = {};
    for (const member of committee) {
      saltMap[member.toLowerCase()] = ethers.id(`salt-${member}`);
    }

    for (const member of committee) {
      const signerIndex = validatorAddresses.findIndex((addr) => addr.toLowerCase() === member.toLowerCase());
      const signer = validators[signerIndex];
      const salt = saltMap[member.toLowerCase()];
      const support = member.toLowerCase() !== validatorAddresses[2].toLowerCase();
      const commitment = ethers.solidityPackedKeccak256(
        ["uint256", "address", "bool", "bytes32", "bytes32"],
        [BigInt(roundId), member, support, salt, jobsRoot]
      );
      await constellation.connect(signer).commitVote(roundId, commitment);
    }

    await time.increase(config.commitWindow + 5);

    for (const member of committee) {
      if (member.toLowerCase() === validatorAddresses[2].toLowerCase()) {
        continue;
      }
      const signerIndex = validatorAddresses.findIndex((addr) => addr.toLowerCase() === member.toLowerCase());
      const signer = validators[signerIndex];
      const salt = saltMap[member.toLowerCase()];
      const support = true;
      await constellation.connect(signer).revealVote(roundId, salt, support);
    }

    await time.increase(config.revealWindow + 5);

    const jobsCount = 1000;
    const proofBytes = ethers.solidityPacked(
      ["uint256", "bytes32", "bytes32", "uint256", "bytes32"],
      [BigInt(roundId), jobBatchId, jobsRoot, BigInt(jobsCount), config.zkSalt]
    );

    await constellation.connect(operator).finalizeRound(roundId, proofBytes, jobsCount);
    const roundState = await constellation.roundState(roundId);
    expect(roundState.finalised).to.equal(true);
    expect(roundState.zkVerified).to.equal(true);
    expect(Number(roundState.totalRevealed)).to.equal(2);
    expect(roundState.proofHash).to.equal(ethers.keccak256(proofBytes));

    const slashedStake = await stakeManager.stakeOf(validatorAddresses[2]);
    const baseStake = ethers.parseEther("10");
    const expectedStake = baseStake - (baseStake * BigInt(config.missedRevealPenaltyBps)) / 10000n;
    expect(slashedStake).to.equal(expectedStake);

    await sentinel
      .connect(watcher)
      .reportBudgetOverrun(
        domain,
        ethers.id("job42"),
        validatorAddresses[2],
        ethers.parseEther("12"),
        ethers.parseEther("5"),
        "Budget exceeded",
        8
      );

    const domainState = await domainAccess.domainState(domain);
    expect(domainState.paused).to.equal(true);

    await expect(
      constellation
        .connect(operator)
        .startValidationRound(domain, ethers.id("batch-new"), ethers.id("root-new"), 3, ethers.id("entropy"))
    ).to.be.revertedWithCustomError(domainAccess, "DomainIsPaused");

    await domainAccess.connect(operator).resumeDomain(domain);
    const resumedState = await domainAccess.domainState(domain);
    expect(resumedState.paused).to.equal(false);
  });

  it("rejects validators without authorised ENS proofs", async () => {
    const { operator, validatorA, outsider, ensAuthorizer, constellation, sentinel } =
      await loadFixture(deployFixture);

    const ensName = "unauthorised.club.agi.eth";
    const nh = namehash(ensName);
    const leaf = solidityPackedKeccak256(["address", "bytes32"], [await validatorA.getAddress(), nh]);
    const tree = buildMerkle([leaf]);

    await ensAuthorizer
      .connect(operator)
      .setRoot(0, false, tree.root, "Authorised validators");

    await expect(
      constellation
        .connect(outsider)
        .registerValidator(ensName, nh, false, tree.getProof(leaf))
    ).to.be.revertedWithCustomError(ensAuthorizer, "InvalidProof");

    await expect(
      sentinel.connect(outsider as any).reportBudgetOverrun(
        ethers.id("domain"),
        ethers.id("job"),
        await outsider.getAddress(),
        0,
        0,
        "",
        1
      )
    ).to.be.revertedWithCustomError(sentinel, "WatcherNotAuthorised");
  });
});
