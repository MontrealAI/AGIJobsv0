import { useState } from 'react'
import { useAccount, useChainId, useWalletClient } from 'wagmi'
import { encodeFunctionData } from 'viem'
import { loadAbi } from '../lib/abis'
import { loadAddresses } from '../lib/addresses'
import { cidFor, ipfsUri } from '../lib/ipfs'

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
    const cid = await cidFor(spec)
    const specURI = ipfsUri(cid)
    setLog((l) => [`Spec CID: ${cid}`, ...l])

    const net = chainId === 31337 ? 'localhost' : String(chainId)
    const addresses = await loadAddresses(net)
    const jrAddr = addresses.JobRegistry as `0x${string}` | undefined
    if (!jrAddr) {
      setLog((l) => [`JobRegistry address not found. Paste in Owner Panel or run CLI.`, ...l])
      return
    }

    try {
      const abi = await loadAbi('JobRegistry')
      const fn = abi.find((x: any) => typeof x?.name === 'string' && /post|create/i.test(x.name))
      if (!fn) {
        setLog((l) => [`Could not locate post/create function in ABI.`, ...l])
        return
      }
      const data = encodeFunctionData({ abi: [fn], functionName: fn.name, args: [specURI] as any })
      const hash = await wallet.sendTransaction({ to: jrAddr, data })
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
