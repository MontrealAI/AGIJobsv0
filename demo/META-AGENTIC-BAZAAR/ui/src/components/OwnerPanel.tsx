import { useState } from 'react'
import { useChainId, useWalletClient } from 'wagmi'
import { loadAbi } from '../lib/abis'
import { loadAddresses, saveAddresses } from '../lib/addresses'

export default function OwnerPanel() {
  const [addrText, setAddrText] = useState('')
  const [abiText, setAbiText] = useState('')
  const [status, setStatus] = useState<string>('')
  const chainId = useChainId()
  const { data: wallet } = useWalletClient()

  async function togglePause(paused: boolean) {
    if (!wallet) {
      setStatus('Connect owner wallet first.')
      return
    }
    const net = chainId === 31337 ? 'localhost' : String(chainId)
    const addresses = await loadAddresses(net)
    const pauseAddr = addresses.SystemPause as `0x${string}` | undefined
    if (!pauseAddr) {
      setStatus('SystemPause address unknown; paste via addresses JSON.')
      return
    }
    try {
      const abi = await loadAbi('SystemPause')
      const fnName = abi.find((item: any) => typeof item.name === 'string' && (paused ? /pause/i : /unpause|resume/i).test(item.name))?.name
      if (!fnName) {
        setStatus('Pause/unpause function not found in ABI.')
        return
      }
      const hash = await wallet.writeContract({ address: pauseAddr, abi, functionName: fnName })
      setStatus(`sent ${fnName}: ${hash}`)
    } catch (err) {
      setStatus((err as Error).message)
    }
  }

  function storeAddresses() {
    try {
      const parsed = JSON.parse(addrText)
      saveAddresses(parsed)
      setStatus('Saved addresses locally.')
    } catch {
      setStatus('Invalid JSON.')
    }
  }

  function storeAbi() {
    try {
      const parsed = JSON.parse(abiText)
      const name = parsed.contractName || parsed.name || 'Unknown'
      const abi = parsed.abi ?? parsed
      localStorage.setItem(`ABI:${name}`, JSON.stringify(abi))
      setStatus(`Saved ABI under ${name}.`)
    } catch {
      setStatus('Invalid ABI JSON.')
    }
  }

  return (
    <div style={{ border: '1px solid #2c2', borderRadius: 8, padding: 12 }}>
      <h4>Owner Panel</h4>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => togglePause(true)}>Pause all</button>
        <button onClick={() => togglePause(false)}>Unpause</button>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary>Manual addresses (JSON)</summary>
        <textarea
          rows={6}
          style={{ width: '100%' }}
          value={addrText}
          onChange={(e) => setAddrText(e.target.value)}
          placeholder='{"JobRegistry":"0x...","StakeManager":"0x...","SystemPause":"0x..."}'
        />
        <button onClick={storeAddresses}>Save</button>
      </details>
      <details style={{ marginTop: 8 }}>
        <summary>Paste ABI JSON (fallback)</summary>
        <textarea rows={8} style={{ width: '100%' }} value={abiText} onChange={(e) => setAbiText(e.target.value)} />
        <button onClick={storeAbi}>Save ABI</button>
      </details>
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}>{status}</div>
    </div>
  )
}
