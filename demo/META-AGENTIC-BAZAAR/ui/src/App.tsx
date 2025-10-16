import '@rainbow-me/rainbowkit/styles.css'
import { WagmiConfig } from 'wagmi'
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit'
import { wagmiConfig, chains } from './lib/chains'
import WalletBar from './components/WalletBar'
import TaskChat from './components/TaskChat'
import JobFeed from './components/JobFeed'
import OwnerPanel from './components/OwnerPanel'
import EnsIpfsHints from './components/EnsIpfsHints'

export default function App() {
  return (
    <WagmiConfig config={wagmiConfig}>
      <RainbowKitProvider chains={chains} theme={lightTheme()}>
        <div style={{maxWidth:980, margin:'24px auto', padding:'0 12px'}}>
          <WalletBar />
          <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, marginTop:12}}>
            <div>
              <TaskChat />
              <EnsIpfsHints />
              <div style={{height:12}} />
              <JobFeed />
            </div>
            <OwnerPanel />
          </div>
        </div>
      </RainbowKitProvider>
    </WagmiConfig>
  )
}
