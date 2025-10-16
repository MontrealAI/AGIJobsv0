export interface AddressMap {
  JobRegistry?: `0x${string}`
  StakeManager?: `0x${string}`
  SystemPause?: `0x${string}`
}

export async function loadAddresses(network: string): Promise<AddressMap> {
  const locations = [
    `/reports/${network}/meta-agentic-bazaar/addresses.json`,
    `/demo/META-AGENTIC-BAZAAR/addresses.${network}.json`
  ]

  for (const url of locations) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
    } catch {
      // ignore and continue
    }
  }

  const cached = localStorage.getItem('MAB:addresses')
  return cached ? JSON.parse(cached) : {}
}

export function saveAddresses(map: AddressMap) {
  localStorage.setItem('MAB:addresses', JSON.stringify(map))
}
