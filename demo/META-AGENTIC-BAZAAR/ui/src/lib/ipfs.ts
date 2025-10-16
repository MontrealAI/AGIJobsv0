import { CID } from 'multiformats/cid'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from 'multiformats/hashes/sha2'
import { keccak256 } from 'viem'

export function encodeSpec(obj: unknown): Uint8Array {
  return dagCbor.encode(obj as any)
}

export function specHashFromBytes(bytes: Uint8Array): `0x${string}` {
  return keccak256(bytes) as `0x${string}`
}

export function specHashFor(obj: unknown): `0x${string}` {
  return specHashFromBytes(encodeSpec(obj))
}

export async function cidFor(obj: unknown, encoded?: Uint8Array): Promise<string> {
  const bytes = encoded ?? encodeSpec(obj)
  const hash = await sha256.digest(bytes)
  const cid = CID.createV1(dagCbor.code, hash)
  return cid.toString()
}

export function ipfsUri(cid: string) {
  return `ipfs://${cid}`
}
