import { useState } from 'react'
import { useAccount, useChainId, useWalletClient } from 'wagmi'
import { loadAbi } from '../lib/abis'
import { loadAddresses } from '../lib/addresses'
import { cidFor, encodeSpec, ipfsUri, specHashFromBytes } from '../lib/ipfs'

const DEFAULT_REWARD = 1_000000000000000000n
const DEFAULT_AGENT_TYPES = 3
const DEFAULT_DEADLINE_OFFSET = 24n * 60n * 60n

export default function TaskChat() {
  const [text, setText] = useState('')
  const [log, setLog] = useState<string[]>([])
  const chainId = useChainId()
  const { data: wallet } = useWalletClient()
  const { address } = useAccount()

  async function postJob() {
    if (!wallet || !address) {
      setLog((l) => [`Connect wallet first`, ...l])
      return
    }
    if (!text.trim()) {
      setLog((l) => [`Enter a task description`, ...l])
      return
    }

    setLog((l) => [`Building job spec…`, ...l])
    const spec = { title: text.slice(0, 120), prompt: text, createdAt: Date.now() }
    const specBytes = encodeSpec(spec)
    const specHash = specHashFromBytes(specBytes)
    const cid = await cidFor(spec, specBytes)
    const specURI = ipfsUri(cid)
    setLog((l) => [`Spec CID: ${cid}`, ...l])
    setLog((l) => [`Spec hash: ${specHash}`, ...l])

    const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
    const deadline = nowSeconds + DEFAULT_DEADLINE_OFFSET
    const reward = DEFAULT_REWARD
    setLog((l) => [`Reward (wei): ${reward.toString()}`, ...l])
    setLog((l) => [`Deadline (unix): ${deadline.toString()}`, ...l])

    const net = chainId === 31337 ? 'localhost' : String(chainId)
    const addresses = await loadAddresses(net)
    const jrAddr = addresses.JobRegistry as `0x${string}` | undefined
    if (!jrAddr) {
      setLog((l) => [`JobRegistry address not found. Paste in Owner Panel or run CLI.`, ...l])
      return
    }

    try {
      const abi = await loadAbi('JobRegistry')
      const candidates = [
        { name: 'createJob', args: [reward, deadline, specHash, specURI] },
        { name: 'acknowledgeAndCreateJob', args: [reward, deadline, specHash, specURI] },
        {
          name: 'createJobWithAgentTypes',
          args: [reward, deadline, DEFAULT_AGENT_TYPES, specHash, specURI]
        },
        {
          name: 'acknowledgeAndCreateJobWithAgentTypes',
          args: [reward, deadline, DEFAULT_AGENT_TYPES, specHash, specURI]
        }
      ] as const
      const match = candidates.find((candidate) =>
        abi.some((item: any) => item?.type === 'function' && item.name === candidate.name)
      )
      if (!match) {
        setLog((l) => [`Could not locate job creation function in ABI.`, ...l])
        return
      }
      const hash = await wallet.writeContract({
        address: jrAddr,
        abi,
        functionName: match.name,
        args: match.args as any
      })
      setLog((l) => [`Submitted tx: ${hash}`, ...l])
    } catch (err) {
      setLog((l) => [`${(err as Error).message}`, ...l])
    }
  }

  return (
    <div style={{ border: '1px solid #333', borderRadius: 8, padding: 12 }}>
      <h4>Post a task</h4>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{ width: '100%' }}
        placeholder="E.g., Summarize 200 PDFs and extract key metrics…"
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={postJob}>Post job</button>
      </div>
      <div style={{ marginTop: 12, fontFamily: 'monospace', fontSize: 12 }}>
        {log.map((entry, i) => (
          <div key={i}>• {entry}</div>
        ))}
      </div>
    </div>
  )
}
