import { ethers } from 'ethers';

export async function verifyEnsSubdomain(
  provider: ethers.Provider,
  address: string
): Promise<string | null> {
  try {
    const name = await provider.lookupAddress(address);
    if (
      name &&
      (name.endsWith('.agent.agi.eth') || name.endsWith('.club.agi.eth')) &&
      name.split('.').length > 3
    ) {
      return null;
    }
  } catch {
    // ignore lookup errors
  }
  return 'No valid *.agent.agi.eth or *.club.agi.eth subdomain found for this address. See docs/ens-identity-setup.md';
}
