export interface EnsResolution {
  readonly owner: string;
  readonly registrant?: string;
  readonly wrapperOwner?: string;
  readonly expiry?: number;
  readonly contentHash?: string | null;
  readonly records: Record<string, string>;
}

export interface EnsLookup {
  resolve(name: string): Promise<EnsResolution>;
}

export interface IdentityVerificationResult {
  readonly ensName: string;
  readonly nodehash: string;
  readonly expectedOwner: string;
  readonly matches: boolean;
  readonly reasons: string[];
  readonly resolution: EnsResolution;
}
