import {
  assertAgentDomain,
  assertNodeDomain,
  assertValidatorDomain,
  EnsProof,
  verifyMerkleProof,
} from './ens';
import { AgentIdentity, Hex, NodeIdentity, ValidatorIdentity } from './types';

const ROOT_PATTERN = /^0x[0-9a-fA-F]{64}$/;

interface AuthorizationRequest {
  ensName: string;
  address: Hex;
  proof: EnsProof;
}

export class EnsAuthority {
  private readonly blacklist = new Set<Hex>();

  constructor(private merkleRoot: Hex) {
    this.assertRoot(merkleRoot);
  }

  ban(address: Hex): void {
    this.blacklist.add(address);
  }

  getMerkleRoot(): Hex {
    return this.merkleRoot;
  }

  updateMerkleRoot(nextRoot: Hex): Hex {
    this.assertRoot(nextRoot);
    this.merkleRoot = nextRoot;
    return this.merkleRoot;
  }

  private assertRoot(root: Hex): void {
    if (!ROOT_PATTERN.test(root)) {
      throw new Error('ENS merkle root must be a 32-byte hex string');
    }
  }

  private assertOwnership(request: AuthorizationRequest): void {
    if (this.blacklist.has(request.address)) {
      throw new Error('address blacklisted');
    }
    if (!verifyMerkleProof(this.merkleRoot, request.proof)) {
      throw new Error('invalid ENS ownership proof');
    }
    if (request.proof.owner !== request.address) {
      throw new Error('proof owner mismatch');
    }
  }

  authorizeValidator(request: AuthorizationRequest, stake: bigint): ValidatorIdentity {
    assertValidatorDomain(request.ensName);
    this.assertOwnership(request);
    return {
      address: request.address,
      ensName: request.ensName,
      stake,
    };
  }

  authorizeAgent(request: AuthorizationRequest, domainId: string, budget: bigint): AgentIdentity {
    assertAgentDomain(request.ensName);
    this.assertOwnership(request);
    return {
      address: request.address,
      ensName: request.ensName,
      domainId,
      budget,
    };
  }

  authorizeNode(request: AuthorizationRequest): NodeIdentity {
    assertNodeDomain(request.ensName);
    this.assertOwnership(request);
    return {
      address: request.address,
      ensName: request.ensName,
    };
  }
}
