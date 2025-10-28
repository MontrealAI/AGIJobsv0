import { createHash } from 'crypto';
import { VRFProof, VRFProvider } from './types';

const hex = (input: Buffer): string => '0x' + input.toString('hex');

export const simpleVRF: VRFProvider = {
  generateProof(input: string, secretKey: string): VRFProof {
    const alpha = createHash('sha256').update(`${secretKey}:${input}:alpha`).digest();
    const beta = createHash('sha256').update(`${secretKey}:${input}:beta`).digest();
    const gamma = createHash('sha256').update(`${secretKey}:${input}:gamma`).digest();
    const hash = createHash('sha256').update(Buffer.concat([alpha, beta, gamma])).digest();
    return {
      alpha: hex(alpha),
      beta: hex(beta),
      gamma: hex(gamma),
      hash: hex(hash),
    };
  },
  verifyProof(proof: VRFProof, input: string, publicKey: string): boolean {
    const recomputed = simpleVRF.generateProof(input, publicKey);
    return (
      recomputed.alpha === proof.alpha &&
      recomputed.beta === proof.beta &&
      recomputed.gamma === proof.gamma &&
      recomputed.hash === proof.hash
    );
  },
  deriveRandomness(proof: VRFProof): string {
    return proof.hash;
  },
};

export const shuffleAddresses = (addresses: string[], randomness: string): string[] => {
  const shuffled = [...addresses];
  let hash = randomness;
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    hash = '0x' + createHash('sha256').update(hash + i.toString()).digest('hex');
    const rand = parseInt(hash.slice(-8), 16);
    const j = rand % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};
