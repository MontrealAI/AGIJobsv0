import fs from 'fs'
import path from 'path'

const base = path.join(process.cwd(), 'reports', 'localhost', 'meta-agentic-bazaar')
const out = path.join(base, 'mission-report.md')
const receiptsDir = path.join(base, 'receipts')
const lines = ['# META‑AGENTIC‑BAZAAR — Mission Report', '']
for (const f of ['01-postJob.json', '02-submit.json', '03-validate.json']) {
  const p = path.join(receiptsDir, f)
  if (fs.existsSync(p)) {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))
    lines.push(`## ${f}`, '```json', JSON.stringify(j, null, 2), '```', '')
  }
}
fs.writeFileSync(out, lines.join('\n'))
console.log(`Wrote ${out}`)
