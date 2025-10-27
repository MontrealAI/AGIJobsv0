import { createHash } from 'crypto';
import { keccak256, toUtf8Bytes } from 'ethers';
import { EntropyWitness, Hex } from './types';

function normalizeHex(value: string): Hex {
  if (!value.startsWith('0x')) {
    throw new Error(`hex value must start with 0x: ${value}`);
  }
  if (value.length % 2 !== 0) {
    return `0x0${value.slice(2)}` as Hex;
  }
  return value as Hex;
}

function bufferFromHex(value: Hex): Buffer {
  const normalized = value.slice(2);
  return Buffer.from(normalized, 'hex');
}

function mixKeccak(sources: Hex[]): Hex {
  let accumulator: Hex = '0x00';
  for (const source of sources) {
    const mixed = Buffer.concat([bufferFromHex(accumulator), bufferFromHex(source)]);
    accumulator = keccak256(mixed) as Hex;
  }
  return accumulator;
}

function mixSha256(sources: Hex[]): Hex {
  const hash = createHash('sha256');
  for (const source of sources) {
    hash.update(bufferFromHex(source));
  }
  return (`0x${hash.digest('hex')}`) as Hex;
}

export function deriveEntropyWitness(params: { sources: Hex[]; domainId: string; round: number }): EntropyWitness {
  if (params.sources.length === 0) {
    throw new Error('entropy sources must not be empty');
  }
  const normalizedSources = params.sources.map((value) => normalizeHex(value));
  const domainHash = keccak256(toUtf8Bytes(params.domainId)) as Hex;
  const roundHash = keccak256(toUtf8Bytes(String(params.round))) as Hex;
  const material: Hex[] = [...normalizedSources, domainHash, roundHash];
  const keccakSeed = mixKeccak(material);
  const shaSeed = mixSha256(material);
  const transcriptMaterial = Buffer.concat([
    ...material.map((item) => bufferFromHex(item)),
    bufferFromHex(keccakSeed),
    bufferFromHex(shaSeed),
  ]);
  const transcript = keccak256(transcriptMaterial) as Hex;
  const consistencyHash = (`0x${createHash('sha256').update(transcriptMaterial).digest('hex')}`) as Hex;
  return {
    sources: normalizedSources,
    domainHash,
    roundHash,
    keccakSeed,
    shaSeed,
    transcript,
    consistencyHash,
  };
}

export function verifyEntropyWitness(
  witness: EntropyWitness,
  params: { domainId: string; round: number; sources?: Hex[] },
): boolean {
  const expectedDomainHash = keccak256(toUtf8Bytes(params.domainId)) as Hex;
  const expectedRoundHash = keccak256(toUtf8Bytes(String(params.round))) as Hex;
  if (expectedDomainHash !== witness.domainHash || expectedRoundHash !== witness.roundHash) {
    return false;
  }
  const baselineSources = params.sources
    ? params.sources.map((value) => normalizeHex(value))
    : witness.sources.map((value) => normalizeHex(value));
  const recomputed = deriveEntropyWitness({
    sources: baselineSources,
    domainId: params.domainId,
    round: params.round,
  });
  return (
    recomputed.keccakSeed === witness.keccakSeed &&
    recomputed.shaSeed === witness.shaSeed &&
    recomputed.transcript === witness.transcript &&
    recomputed.consistencyHash === witness.consistencyHash
  );
}

export function entropyWitnessToString(witness: EntropyWitness): string {
  return [
    `sources:${witness.sources.join(',')}`,
    `domainHash:${witness.domainHash}`,
    `roundHash:${witness.roundHash}`,
    `keccak:${witness.keccakSeed}`,
    `sha:${witness.shaSeed}`,
    `transcript:${witness.transcript}`,
    `consistency:${witness.consistencyHash}`,
  ].join('|');
}
