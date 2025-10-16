import { useEffect, useState } from 'react'
import { useChainId } from 'wagmi'
import { createPublicClient, http, decodeEventLog } from 'viem'
import { loadAbi } from '../lib/abis'
import { loadAddresses } from '../lib/addresses'

export default function JobFeed() {
  const [events, setEvents] = useState<any[]>([])
  const chainId = useChainId()

  useEffect(() => {
    (async () => {
      const net = chainId===31337?'localhost':String(chainId)
      const addr = await loadAddresses(net)
      if (!addr.JobRegistry) return
      const abi = await loadAbi('JobRegistry')
      const pc = createPublicClient({ chain: { id: chainId, name:String(chainId), nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18}, rpcUrls:{default:{http:['http://127.0.0.1:8545']}}}, transport: http()})
      try {
        const logs = await pc.getLogs({ address: addr.JobRegistry as `0x${string}`, fromBlock: 0n })
        const decoded = logs.map(l => {
          try {
            return { ...l, parsed: decodeEventLog({ abi, data: l.data, topics: l.topics }) }
          } catch {
            return { ...l }
          }
        })
        setEvents(decoded.reverse())
      } catch {}
    })()
  }, [chainId])

  return (
    <div style={{border:'1px dashed #444',borderRadius:8,padding:12}}>
      <h4>Live job feed</h4>
      {events.length===0 && <div>No events yet. Post a job!</div>}
      {events.map((e,i)=>(
        <div key={i} style={{margin:'8px 0',fontFamily:'monospace',fontSize:12}}>
          <div>block {e.blockNumber?.toString?.() ?? e.blockNumber} — topic {e.topics?.[0]}</div>
          <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(e.parsed || e, null, 2)}</pre>
        </div>
      ))}
    </div>
  )
}
