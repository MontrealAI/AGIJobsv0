import { useEffect, useState } from 'react'
import { useChainId } from 'wagmi'
import { createPublicClient, decodeEventLog, http } from 'viem'
import { loadAbi } from '../lib/abis'
import { loadAddresses } from '../lib/addresses'

export default function JobFeed() {
  const chainId = useChainId()
  const [events, setEvents] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const net = chainId === 31337 ? 'localhost' : String(chainId)
      const addresses = await loadAddresses(net)
      if (!addresses.JobRegistry) return
      try {
        const abi = await loadAbi('JobRegistry')
        const client = createPublicClient({
          chain: {
            id: chainId,
            name: String(chainId),
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } }
          },
          transport: http()
        })
        const logs = await client.getLogs({
          address: addresses.JobRegistry as `0x${string}`,
          fromBlock: 0n
        })
        const decoded = logs
          .map((log) => {
            try {
              const parsed = decodeEventLog({ abi, data: log.data, topics: log.topics })
              return { ...log, parsed }
            } catch {
              return log
            }
          })
          .reverse()
        setEvents(decoded)
      } catch (err) {
        console.warn('JobFeed error', err)
      }
    }
    load()
  }, [chainId])

  return (
    <div style={{ border: '1px dashed #444', borderRadius: 8, padding: 12 }}>
      <h4>Live job feed</h4>
      {events.length === 0 && <div>No events yet. Post a job!</div>}
      {events.map((event, idx) => (
        <div key={idx} style={{ margin: '8px 0', fontFamily: 'monospace', fontSize: 12 }}>
          <div>block {event.blockNumber?.toString?.() ?? '–'} — topic {event.topics?.[0]}</div>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(event.parsed ?? event, null, 2)}</pre>
        </div>
      ))}
    </div>
  )
}
