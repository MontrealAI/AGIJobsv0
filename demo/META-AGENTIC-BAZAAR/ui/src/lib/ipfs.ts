import { CID } from 'multiformats/cid'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from 'multiformats/hashes/sha2'

export async function cidFor(obj: unknown): Promise<string> {
  const bytes = dagCbor.encode(obj as any)
  const hash = await sha256.digest(bytes)
  const cid = CID.createV1(dagCbor.code, hash)
  return cid.toString()
}

export function ipfsUri(cid: string) {
  return `ipfs://${cid}`
}
