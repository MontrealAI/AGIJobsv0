export interface AddrMap { JobRegistry?: `0x${string}`; StakeManager?: `0x${string}`; SystemPause?: `0x${string}` }
export async function loadAddresses(net: string): Promise<AddrMap> {
  const tries = [
    `/reports/${net}/meta-agentic-bazaar/addresses.json`,
    `/demo/META-AGENTIC-BAZAAR/addresses.${net}.json`
  ]
  for (const t of tries) {
    try {
      const r = await fetch(t)
      if (r.ok) return await r.json()
    } catch {}
  }
  const local = localStorage.getItem('MAB:addresses')
  return local ? JSON.parse(local) : {}
}
export function saveAddresses(map: AddrMap) {
  localStorage.setItem('MAB:addresses', JSON.stringify(map))
}
