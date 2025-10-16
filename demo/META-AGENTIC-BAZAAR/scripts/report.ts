import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const BASE = path.join(ROOT, 'reports', 'localhost', 'meta-agentic-bazaar')
const RECEIPTS = path.join(BASE, 'receipts')
const OUT = path.join(BASE, 'mission-report.md')

const sections: string[] = ['# META‑AGENTIC‑BAZAAR — Mission Report', '']

for (const file of ['01-postJob.json', '02-submit.json', '03-validate.json']) {
  const target = path.join(RECEIPTS, file)
  if (fs.existsSync(target)) {
    const body = fs.readFileSync(target, 'utf8')
    sections.push(`## ${file}`, '```json', JSON.stringify(JSON.parse(body), null, 2), '```', '')
  }
}

fs.writeFileSync(OUT, sections.join('\n'))
console.log(`Wrote ${OUT}`)
