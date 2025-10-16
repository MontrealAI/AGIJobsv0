export async function loadAbi(name: 'JobRegistry' | 'StakeManager' | 'SystemPause'): Promise<any> {
  const candidates = [
    `/artifacts/contracts/${name}.sol/${name}.json`,
    `/packages/${name.toLowerCase()}/artifacts/contracts/${name}.sol/${name}.json`
  ]

  for (const path of candidates) {
    try {
      const res = await fetch(path)
      if (res.ok) {
        const json = await res.json()
        if (json.abi) return json.abi
      }
    } catch (err) {
      console.warn(`Failed to load ABI from ${path}`, err)
    }
  }

  const fallback = localStorage.getItem(`ABI:${name}`)
  if (!fallback) {
    throw new Error(`ABI for ${name} not found; paste it in Owner Panel.`)
  }
  return JSON.parse(fallback)
}
