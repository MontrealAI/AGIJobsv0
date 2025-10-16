#!/usr/bin/env ts-node
import crypto from 'crypto'

const plan = {
  network: 'mainnet',
  actions: [
    'run scripts/v2/deployDefaults.ts --network mainnet',
    'owner:verify-control',
    'owner:diagram',
    'publish addresses.json + receipts to reports/mainnet/meta-agentic-bazaar'
  ],
  timestamp: new Date().toISOString()
}
const digest = crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex')
console.log('--- MAINNET DEPLOY PLAN (DRY-RUN) ---')
console.log(JSON.stringify({ plan, sha256: digest }, null, 2))
if (process.env.CONFIRM === 'true') {
  console.log('CONFIRM=true set → execute your existing deploy script now.')
  process.exit(0)
}
