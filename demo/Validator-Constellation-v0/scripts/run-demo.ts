import { ethers } from "hardhat";
import { solidityPackedKeccak256, namehash } from "ethers";

function buildMerkle(leaves: string[]) {
  const layers: string[][] = [];
  if (leaves.length === 0) {
    throw new Error("Cannot build a tree with no leaves");
  }
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
      throw new Error("Leaf not found in tree");
    }
    for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex++) {
      const layer = layers[layerIndex];
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

async function main() {
  const [operator, validatorA, validatorB, validatorC, watcher, treasury] = await ethers.getSigners();

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
  await sentinel.connect(operator).configureWatcher(await watcher.getAddress(), true, "budget-sentinel");

  const config = {
    commitWindow: 120,
    revealWindow: 120,
    quorumBps: 6000,
    incorrectVotePenaltyBps: 2500,
    missedRevealPenaltyBps: 5000,
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

  const validators = [validatorA, validatorB, validatorC];
  const validatorAddresses = await Promise.all(validators.map((signer) => signer.getAddress()));
  const validatorCAddress = validatorAddresses[2].toLowerCase();
  const ensNames = ["andromeda.club.agi.eth", "rigel.club.agi.eth", "vega.alpha.club.agi.eth"];
  const leaves = validatorAddresses.map((addr, idx) => {
    const nh = namehash(ensNames[idx]);
    return solidityPackedKeccak256(["address", "bytes32"], [addr, nh]);
  });
  const merkle = buildMerkle(leaves);
  await ensAuthorizer
    .connect(operator)
    .setRoot(0, false, merkle.root, "Validators (.club.agi.eth)");
  await ensAuthorizer
    .connect(operator)
    .setRoot(0, true, merkle.root, "Validators (.alpha.club.agi.eth)");

  for (let i = 0; i < validators.length; i++) {
    const signer = validators[i];
    const stakeTx = await stakeManager
      .connect(signer)
      .depositStake(validatorAddresses[i], { value: ethers.parseEther("10") });
    await stakeTx.wait();
    const nh = namehash(ensNames[i]);
    const proof = merkle.getProof(leaves[i]);
    const isAlpha = ensNames[i].includes(".alpha.");
    await constellation
      .connect(signer)
      .registerValidator(ensNames[i], nh, isAlpha, proof);
  }

  const domain = ethers.id("ai-supercluster");
  const jobBatchId = ethers.id("batch-001");
  const jobsRoot = ethers.id("jobs-root-1000");
  const externalEntropy = ethers.id("operator-seed");

  await constellation
    .connect(operator)
    .startValidationRound(domain, jobBatchId, jobsRoot, 3, externalEntropy);
  const roundId = Number((await constellation.nextRoundId()) - 1n);

  const committee = await constellation.roundCommittee(roundId);
  console.log("Committee members:");
  for (const member of committee) {
    const info = await constellation.validatorInfo(member);
    console.log(` - ${info.ensName} (${member})`);
  }

  const addressToSigner = new Map<string, typeof validators[number]>();
  validatorAddresses.forEach((addr, idx) => {
    addressToSigner.set(addr.toLowerCase(), validators[idx]);
  });

  for (const member of committee) {
    const signer = addressToSigner.get(member.toLowerCase()) ?? validators[0];
    const salt = ethers.id(`salt-${member}`);
    const support = member.toLowerCase() !== validatorCAddress;
    const commitment = ethers.solidityPackedKeccak256(
      ["uint256", "address", "bool", "bytes32", "bytes32"],
      [BigInt(roundId), member, support, salt, jobsRoot]
    );
    await constellation.connect(signer).commitVote(roundId, commitment);
  }

  await ethers.provider.send("evm_increaseTime", [config.commitWindow + 10]);
  await ethers.provider.send("evm_mine", []);

  for (const member of committee) {
    const signer = addressToSigner.get(member.toLowerCase()) ?? validators[0];
    const salt = ethers.id(`salt-${member}`);
    const support = member.toLowerCase() !== validatorCAddress;
    await constellation.connect(signer).revealVote(roundId, salt, support);
  }

  await ethers.provider.send("evm_increaseTime", [config.revealWindow + 10]);
  await ethers.provider.send("evm_mine", []);

  const jobsCount = 1000;
  const proofBytes = ethers.solidityPacked(
    ["uint256", "bytes32", "bytes32", "uint256", "bytes32"],
    [BigInt(roundId), jobBatchId, jobsRoot, BigInt(jobsCount), config.zkSalt]
  );
  await constellation
    .connect(operator)
    .finalizeRound(roundId, proofBytes, jobsCount);
  const roundState = await constellation.roundState(roundId);
  console.log(`Round ${roundId} finalised at ${roundState.finalisedAt} with proof ${roundState.proofHash}`);

  const anomalyTx = await sentinel
    .connect(watcher)
    .reportBudgetOverrun(
      domain,
      ethers.id("job-critical-42"),
      validatorAddresses[2],
      ethers.parseEther("12"),
      ethers.parseEther("5"),
      "Validator agent overspend detected",
      9
    );
  await anomalyTx.wait();
  const state = await domainAccess.domainState(domain);
  console.log(`Domain paused: ${state.paused} reason: ${state.reason}`);

  await domainAccess.connect(operator).resumeDomain(domain);
  console.log("Domain resumed by operator");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
