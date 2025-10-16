import { ConnectButton } from '@rainbow-me/rainbowkit'
export default function WalletBar() {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
      <h3>🛠️ META‑AGENTIC‑BAZAAR</h3>
      <ConnectButton />
    </div>
  )
}
