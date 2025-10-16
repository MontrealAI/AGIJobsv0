export default function EnsIpfsHints() {
  return (
    <div style={{ fontSize: 12, lineHeight: 1.4 }}>
      <p><strong>Tip:</strong> Paste ENS names (e.g., <code>agent.eth</code>) or IPFS URIs (<code>ipfs://...</code>) anywhere the demo accepts addresses.</p>
      <p>The UI never uploads job specs; it computes a CID locally so you can pin or publish elsewhere.</p>
    </div>
  )
}
