import { ethers } from "ethers";
import type { ICSType } from "../router.js";
import { loadContracts, getSignerForUser } from "../chain/deps.js";
import { formatError } from "./common.js";

export async function* commitReveal(ics: ICSType) {
  const jobIdInput = (ics.params as any)?.jobId;
  const validation = ((ics.params as any)?.validation ?? {}) as Record<string, unknown>;
  const ens = ((ics.params as any)?.ens ?? {}) as Record<string, unknown>;
  const userId = ics.meta?.userId;

  if (!jobIdInput) {
    yield "Missing jobId.\n";
    return;
  }
  if (!validation.vote) {
    yield "Missing validation vote.\n";
    return;
  }
  if (!validation.salt) {
    yield "Missing validation salt.\n";
    return;
  }
  if (!userId) {
    yield "Missing meta.userId for signing.\n";
    return;
  }

  try {
    const jobId = normalizeJobId(jobIdInput);
    const approve = parseVote(validation.vote);
    const salt = deriveSalt(validation.salt);
    const burnTxHash = normalizeBytes32(validation.burnTxHash);
    const subdomain = normalizeSubdomain(validation.subdomain ?? ens.subdomain);
    const proof = normalizeProof(validation.proof ?? ens.proof);

    const signer = await getSignerForUser(userId);
    const { jobRegistry, validationModule } = loadContracts(signer);
    const validatorAddress = await signer.getAddress();

    const [nonce, specHash, domainSeparator, chainId] = await Promise.all([
      validationModule.jobNonce(jobId),
      jobRegistry.getSpecHash(jobId),
      validationModule.DOMAIN_SEPARATOR(),
      resolveChainId(signer),
    ]);

    const commitHash = computeCommitHash({
      jobId,
      nonce,
      approve,
      burnTxHash,
      salt,
      specHash,
      domainSeparator,
      chainId,
      validator: validatorAddress,
    });

    yield "🗳️ Committing validation vote…\n";
    const commitTx = await validationModule.commitValidation(
      jobId,
      commitHash,
      subdomain,
      proof
    );
    yield `⛓️ Commit tx submitted: ${commitTx.hash}\n`;
    await commitTx.wait();

    yield "🔓 Revealing validation vote…\n";
    const revealTx = await validationModule.revealValidation(
      jobId,
      approve,
      burnTxHash,
      salt,
      subdomain,
      proof
    );
    yield `⛓️ Reveal tx submitted: ${revealTx.hash}\n`;
    await revealTx.wait();

    yield `✅ Validation recorded for job #${jobId.toString()}.\n`;
  } catch (error: unknown) {
    yield formatError(error);
  }
}

function normalizeJobId(input: unknown): bigint {
  if (typeof input === "bigint") {
    return input;
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Invalid jobId");
    return BigInt(Math.floor(input));
  }
  if (typeof input === "string") {
    const trimmed = input.trim().replace(/^#/, "");
    if (!trimmed) throw new Error("Invalid jobId");
    return BigInt(trimmed);
  }
  throw new Error("Invalid jobId");
}

function parseVote(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "approve", "approved", "accept", "success"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "reject", "rejected", "deny", "fail", "failed"].includes(normalized)) {
      return false;
    }
  }
  throw new Error("Unsupported validation vote");
}

function deriveSalt(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) throw new Error("Validation salt cannot be empty");
    try {
      const bytes = ethers.getBytes(trimmed);
      if (bytes.length !== 32) {
        throw new Error("Invalid length");
      }
      return ethers.hexlify(bytes);
    } catch (error) {
      if (error instanceof Error && /offset out of bounds|invalid hex/i.test(error.message)) {
        // Fallback to hashing arbitrary input into bytes32
        return ethers.keccak256(ethers.toUtf8Bytes(trimmed));
      }
      if (error instanceof Error && /invalid length/i.test(error.message)) {
        throw new Error("Validation salt must be 32 bytes");
      }
      return ethers.keccak256(ethers.toUtf8Bytes(trimmed));
    }
  }
  if (value instanceof Uint8Array) {
    if (value.length !== 32) throw new Error("Validation salt must be 32 bytes");
    return ethers.hexlify(value);
  }
  throw new Error("Validation salt must be provided as a string or bytes");
}

function normalizeBytes32(value: unknown): string {
  if (!value) {
    return ethers.ZeroHash;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return ethers.ZeroHash;
    const bytes = ethers.getBytes(trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`);
    if (bytes.length !== 32) {
      throw new Error("Burn receipt hash must be 32 bytes");
    }
    return ethers.hexlify(bytes);
  }
  if (value instanceof Uint8Array) {
    if (value.length !== 32) throw new Error("Burn receipt hash must be 32 bytes");
    return ethers.hexlify(value);
  }
  throw new Error("Burn receipt hash must be a bytes32 value");
}

function normalizeSubdomain(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function normalizeProof(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    if (typeof entry !== "string") {
      throw new Error("ENS proof entries must be hex strings");
    }
    const bytes = ethers.getBytes(entry);
    if (bytes.length !== 32) {
      throw new Error("ENS proof entries must be 32-byte values");
    }
    return ethers.hexlify(bytes);
  });
}

function computeCommitHash(params: {
  jobId: bigint;
  nonce: bigint;
  approve: boolean;
  burnTxHash: string;
  salt: string;
  specHash: string;
  domainSeparator: string;
  chainId: bigint;
  validator: string;
}): string {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const outcomeHash = ethers.keccak256(
    coder.encode(
      ["uint256", "bytes32", "bool", "bytes32"],
      [params.nonce, params.specHash, params.approve, params.burnTxHash]
    )
  );
  return ethers.keccak256(
    coder.encode(
      ["uint256", "bytes32", "bytes32", "address", "uint256", "bytes32"],
      [params.jobId, outcomeHash, params.salt, params.validator, params.chainId, params.domainSeparator]
    )
  );
}

async function resolveChainId(signer: ethers.Signer): Promise<bigint> {
  if (typeof (signer as ethers.Signer & { getChainId?: () => Promise<number | bigint> }).getChainId === "function") {
    const raw = await (signer as ethers.Signer & { getChainId?: () => Promise<number | bigint> }).getChainId!();
    return typeof raw === "bigint" ? raw : BigInt(raw);
  }
  const provider = signer.provider;
  if (!provider) {
    throw new Error("Signer is missing provider for chain id resolution");
  }
  const network = await provider.getNetwork();
  return typeof network.chainId === "bigint" ? network.chainId : BigInt(network.chainId);
}
