import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const TARGET = path.join(ROOT, 'reports', 'localhost', 'meta-agentic-bazaar')
fs.mkdirSync(TARGET, { recursive: true })

const guesses = [
  path.join(ROOT, 'reports', 'localhost', 'addresses.json'),
  path.join(ROOT, 'deployments', 'localhost', 'addresses.json')
]

for (const guess of guesses) {
  if (fs.existsSync(guess)) {
    const json = JSON.parse(fs.readFileSync(guess, 'utf8'))
    fs.writeFileSync(path.join(TARGET, 'addresses.json'), JSON.stringify(json, null, 2))
    console.log('Wrote addresses.json for UI consumption.')
    process.exit(0)
  }
}

console.warn('Could not discover addresses; paste them via the Owner Panel.')
