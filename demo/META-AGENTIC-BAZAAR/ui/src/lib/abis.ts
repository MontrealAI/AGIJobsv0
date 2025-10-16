export async function loadAbi(name: 'JobRegistry'|'StakeManager'|'SystemPause'): Promise<any> {
  const cand = [
    `/artifacts/contracts/${name}.sol/${name}.json`,
    `/packages/*/artifacts/contracts/${name}.sol/${name}.json`
  ]
  for (const p of cand) {
    try {
      const res = await fetch(p)
      if (res.ok) {
        const j = await res.json()
        if (j.abi) return j.abi
      }
    } catch {}
  }
  const raw = localStorage.getItem(`ABI:${name}`)
  if (!raw) throw new Error(`ABI for ${name} not found; paste it in OwnerPanel.`)
  return JSON.parse(raw)
}
