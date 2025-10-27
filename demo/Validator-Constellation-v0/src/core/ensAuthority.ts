import { assertAgentDomain, assertNodeDomain, assertValidatorDomain, EnsProof, verifyMerkleProof } from './ens';
import { AgentIdentity, Hex, ValidatorIdentity } from './types';

interface AuthorizationRequest {
  ensName: string;
  address: Hex;
  proof: EnsProof;
}

export class EnsAuthority {
  private readonly blacklist = new Set<Hex>();

  constructor(private readonly merkleRoot: Hex) {}

  ban(address: Hex): void {
    this.blacklist.add(address);
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

  authorizeNode(request: AuthorizationRequest): void {
    assertNodeDomain(request.ensName);
    this.assertOwnership(request);
  }
}
