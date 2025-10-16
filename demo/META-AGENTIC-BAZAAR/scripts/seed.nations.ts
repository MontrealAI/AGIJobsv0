import fs from 'fs'
import path from 'path'

const OUT = path.join(process.cwd(), 'reports', 'localhost', 'meta-agentic-bazaar')
fs.mkdirSync(OUT, { recursive: true })
const nations = [
  { label: 'Nation-A', role: 'employer' },
  { label: 'Nation-B', role: 'employer' },
  { label: 'Nation-C', role: 'employer' }
]
fs.writeFileSync(path.join(OUT, 'nations.json'), JSON.stringify({ nations }, null, 2))
console.log('Seeded nations → reports/localhost/meta-agentic-bazaar/nations.json')
