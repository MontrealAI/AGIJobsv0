import fs from 'fs'
import path from 'path'

const OUT = path.join(process.cwd(), 'reports', 'localhost', 'meta-agentic-bazaar')
fs.mkdirSync(OUT, { recursive: true })
const guess = [
  path.join(process.cwd(), 'reports', 'localhost', 'addresses.json'),
  path.join(process.cwd(), 'deployments', 'localhost', 'addresses.json')
]
for (const g of guess) {
  if (fs.existsSync(g)) {
    const j = JSON.parse(fs.readFileSync(g, 'utf8'))
    fs.writeFileSync(path.join(OUT, 'addresses.json'), JSON.stringify(j, null, 2))
    console.log('Wrote addresses.json for UI.')
    process.exit(0)
  }
}
console.warn('Could not discover addresses; paste them in UI Owner Panel.')
