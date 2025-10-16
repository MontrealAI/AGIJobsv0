import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit'
import { WagmiConfig } from 'wagmi'
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
        <div style={{ maxWidth: 980, margin: '24px auto', padding: '0 12px' }}>
          <WalletBar />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <TaskChat />
              <div style={{ height: 12 }} />
              <JobFeed />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <OwnerPanel />
              <EnsIpfsHints />
            </div>
          </div>
        </div>
      </RainbowKitProvider>
    </WagmiConfig>
  )
}
