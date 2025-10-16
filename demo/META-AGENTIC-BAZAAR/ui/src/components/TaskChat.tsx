import { useState } from 'react'
import { useAccount, useChainId, useWalletClient } from 'wagmi'
import { loadAbi } from '../lib/abis'
import { loadAddresses } from '../lib/addresses'
import { cidFor, ipfsUri } from '../lib/ipfs'
import { encodeFunctionData } from 'viem'

export default function TaskChat() {
  const [text, setText] = useState('')
  const [log, setLog] = useState<string[]>([])
  const { data: wallet } = useWalletClient()
  const chainId = useChainId()
  const { address } = useAccount()

  async function postJob() {
    if (!wallet || !address) return setLog(l => [`Connect wallet first`, ...l])
    if (!text.trim()) return setLog(l=>[`Enter a job description first.`, ...l])
    setLog(l=>[`Building job spec…`, ...l])
    const spec = { title: text.slice(0,120), prompt: text, createdAt: Date.now() }
    const cid = await cidFor(spec)
    const specURI = ipfsUri(cid)
    setLog(l=>[`Spec CID: ${cid}`, ...l])

    const addr = await loadAddresses(chainId===31337?'localhost':String(chainId))
    const jrAddr = addr.JobRegistry as `0x${string}` | undefined
    if (!jrAddr) return setLog(l=>[`JobRegistry address not found. Paste in Owner Panel or run CLI.`, ...l])

    const abi = await loadAbi('JobRegistry')
    const fn = (abi as any[]).find((x:any)=>x?.type==='function' && (x.name?.toLowerCase().includes('post') || x.name?.toLowerCase().includes('create')))
    if (!fn) return setLog(l=>[`Could not locate post/create function in ABI.`, ...l])

    const data = encodeFunctionData({ abi:[fn], functionName: fn.name, args: [specURI] as any })
    const tx = await wallet.sendTransaction({ to: jrAddr, data })
    setLog(l=>[`Submitted tx: ${tx}`, ...l])
  }

  return (
    <div style={{border:'1px solid #333',borderRadius:8,padding:12}}>
      <h4>Post a task</h4>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={4} style={{width:'100%'}} placeholder="E.g., Summarize 200 PDFs and extract key metrics…" />
      <div style={{display:'flex',gap:8,marginTop:8}}>
        <button onClick={postJob}>Post job</button>
      </div>
      <div style={{marginTop:12,fontFamily:'monospace',fontSize:12}}>
        {log.map((x,i)=><div key={i}>• {x}</div>)}
      </div>
    </div>
  )
}
