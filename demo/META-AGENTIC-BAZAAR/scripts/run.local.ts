#!/usr/bin/env ts-node
import { spawn, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../../..')
const OUT = path.join(ROOT, 'reports', 'localhost', 'meta-agentic-bazaar')
fs.mkdirSync(path.join(OUT, 'receipts'), { recursive: true })

const replacer = (_: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value

function sh(cmd: string, env: Record<string,string> = {}) {
  return execSync(cmd, { stdio: 'pipe', cwd: ROOT, env: { ...process.env, ...env } }).toString().trim()
}

async function main() {
  const anvil = spawn('anvil', ['--silent', '--block-time', '1'], { cwd: ROOT, stdio: 'ignore' })
  process.on('exit', () => anvil.kill('SIGTERM'))
  await new Promise(resolve => setTimeout(resolve, 1500))

  try {
    sh('npx hardhat run scripts/v2/deployDefaults.ts --network localhost')
  } catch (e) {
    console.error('deployDefaults.ts failed. Ensure this script exists in the repo.')
    throw e
  }

  try { sh('npx ts-node demo/META-AGENTIC-BAZAAR/scripts/seed.nations.ts') } catch {}

  let quickstart: any
  try {
    quickstart = require(path.join(ROOT, 'examples', 'ethers-quickstart.js'))
  } catch (err) {
    console.error('examples/ethers-quickstart.js not found; adapt run.local.ts to your helper.')
    process.exit(1)
  }

  const spec = { title: 'Translate 20 docs to FR/ES', prompt: 'Translate & summarize' }
  const job = await quickstart.postJob(spec)
  fs.writeFileSync(path.join(OUT, 'receipts', '01-postJob.json'), JSON.stringify(job, replacer, 2))

  await quickstart.acknowledgeTaxPolicy?.()
  await quickstart.prepareStake?.('50000000')
  await quickstart.stake?.('20000000')

  const sub = await quickstart.submit(job.jobId, 'ipfs://bafybeigdyr-example-result')
  fs.writeFileSync(path.join(OUT, 'receipts', '02-submit.json'), JSON.stringify(sub, replacer, 2))

  const val = await quickstart.validate(job.jobId, true, { skipFinalize: false })
  fs.writeFileSync(path.join(OUT, 'receipts', '03-validate.json'), JSON.stringify(val, replacer, 2))

  try { sh('npx ts-node demo/META-AGENTIC-BAZAAR/scripts/write-addresses.ts') } catch {}
  try { sh('npx ts-node demo/META-AGENTIC-BAZAAR/scripts/report.ts') } catch {}

  console.log('✅ Local demo complete → open UI and select Hardhat chain.')
  anvil.kill('SIGTERM')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
