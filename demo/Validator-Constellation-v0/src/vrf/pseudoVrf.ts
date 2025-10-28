import { keccak256, verifyMessage } from "ethers";

export interface PseudoVrfProof {
  readonly proof: string;
  readonly output: string;
}

export interface SigningWallet {
  readonly address: string;
  signMessage(message: Uint8Array): Promise<string>;
}

function deriveMessage(roundId: string, entropy: string): string {
  return keccak256(Buffer.from(`${roundId}:${entropy}`, "utf8"));
}

export async function evaluatePseudoVrf(
  wallet: SigningWallet,
  roundId: string,
  entropy: string
): Promise<PseudoVrfProof> {
  const message = deriveMessage(roundId, entropy);
  const proof = await wallet.signMessage(Buffer.from(message.slice(2), "hex"));
  return {
    proof,
    output: keccak256(Buffer.from(proof.slice(2), "hex")),
  };
}

export async function verifyPseudoVrf(
  address: string,
  roundId: string,
  entropy: string,
  proof: string
): Promise<PseudoVrfProof | null> {
  const message = deriveMessage(roundId, entropy);
  const recovered = await verifyMessage(Buffer.from(message.slice(2), "hex"), proof);
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return null;
  }
  return {
    proof,
    output: keccak256(Buffer.from(proof.slice(2), "hex")),
  };
}
