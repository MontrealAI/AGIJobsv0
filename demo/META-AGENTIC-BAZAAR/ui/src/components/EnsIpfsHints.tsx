export default function EnsIpfsHints() {
  return (
    <div style={{fontSize:12, color:'#555', marginTop:12}}>
      <strong>ENS/IPFS tips:</strong> Specs are encoded as DAG-CBOR and addressed by CID. Pin the JSON to any IPFS gateway or
      attach an ENS text record for discovery. No centralized server required.
    </div>
  )
}
