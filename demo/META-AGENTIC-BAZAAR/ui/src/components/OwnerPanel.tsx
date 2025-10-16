import { useState } from 'react'
import { useWalletClient, useChainId } from 'wagmi'
import { loadAbi } from '../lib/abis'
import { loadAddresses, saveAddresses } from '../lib/addresses'

export default function OwnerPanel() {
  const [addrIn, setAddrIn] = useState('')
  const [abiIn, setAbiIn] = useState('')
  const [out, setOut] = useState<string>()
  const chainId = useChainId()
  const { data: wallet } = useWalletClient()

  async function pauseAll(paused: boolean) {
    if (!wallet) return setOut('Connect with an owner wallet.')
    const net = chainId===31337?'localhost':String(chainId)
    const addrs = await loadAddresses(net)
    if (!addrs.SystemPause) return setOut('SystemPause address not known; set in addresses.json or paste.')
    const abi = await loadAbi('SystemPause')
    const fnName = paused ? (abi as any[]).find((x:any)=>x.name?.toLowerCase().includes('pause'))?.name : (abi as any[]).find((x:any)=>x.name?.toLowerCase().includes('unpause'))?.name
    if (!fnName) return setOut('Pause/unpause function not found in ABI.')
    try {
      const tx = await wallet.writeContract({ address: addrs.SystemPause as `0x${string}`, abi, functionName: fnName })
      setOut(`sent ${fnName}: ${tx}`)
    } catch (err:any) {
      setOut(`tx failed: ${err?.message || err}`)
    }
  }

  function saveAddr() {
    try { saveAddresses(JSON.parse(addrIn)); setOut('Saved addresses to local storage. UI will use them.'); }
    catch { setOut('Invalid JSON.') }
  }
  function saveAbi() {
    try {
      const j = JSON.parse(abiIn)
      const name = j.contractName || j.name || 'Unknown'
      localStorage.setItem(`ABI:${name}`, JSON.stringify(j.abi || j))
      setOut(`Saved ABI under ${name}`)
    } catch {
      setOut('Invalid ABI JSON.')
    }
  }

  return (
    <div style={{border:'1px solid #2c2',borderRadius:8,padding:12}}>
      <h4>Owner Panel</h4>
      <div style={{display:'flex',gap:8}}>
        <button onClick={()=>pauseAll(true)}>Pause all</button>
        <button onClick={()=>pauseAll(false)}>Unpause</button>
      </div>
      <details style={{marginTop:8}}>
        <summary>Manual addresses (JSON)</summary>
        <textarea rows={6} style={{width:'100%'}} value={addrIn} onChange={e=>setAddrIn(e.target.value)} placeholder='{"JobRegistry":"0x...","StakeManager":"0x...","SystemPause":"0x..."}'/>
        <button onClick={saveAddr}>Save</button>
      </details>
      <details style={{marginTop:8}}>
        <summary>Paste ABI JSON (if artifacts not discoverable)</summary>
        <textarea rows={8} style={{width:'100%'}} value={abiIn} onChange={e=>setAbiIn(e.target.value)} />
        <button onClick={saveAbi}>Save ABI</button>
      </details>
      <div style={{marginTop:8, fontFamily:'monospace', fontSize:12}}>{out}</div>
    </div>
  )
}
