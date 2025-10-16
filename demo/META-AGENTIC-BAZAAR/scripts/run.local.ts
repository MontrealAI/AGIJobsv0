#!/usr/bin/env ts-node
import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../../..')
const REPORT_DIR = path.join(ROOT, 'reports', 'localhost', 'meta-agentic-bazaar')
const RECEIPTS_DIR = path.join(REPORT_DIR, 'receipts')

function ensureDirs() {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true })
}

function run(cmd: string, opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  return execSync(cmd, {
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env, ...opts.env },
    stdio: 'pipe'
  }).toString()
}

async function main() {
  ensureDirs()
  const anvil = spawn('anvil', ['--silent', '--block-time', '1'], { cwd: ROOT, stdio: 'ignore' })
  process.on('exit', () => {
    anvil.kill('SIGTERM')
  })
  await new Promise((resolve) => setTimeout(resolve, 1500))

  try {
    run('npx hardhat run scripts/v2/deployDefaults.ts --network localhost')
  } catch (err) {
    console.error('deployDefaults.ts failed. Ensure this helper exists in the repository.')
    throw err
  }

  try {
    run('npx ts-node demo/META-AGENTIC-BAZAAR/scripts/seed.nations.ts')
  } catch (err) {
    console.warn('seed.nations.ts failed (optional)', err instanceof Error ? err.message : err)
  }

  let quickstart: any
  try {
    quickstart = require(path.join(ROOT, 'examples', 'ethers-quickstart.js'))
  } catch (err) {
    console.error('examples/ethers-quickstart.js not found; adjust run.local.ts to point at your helper.')
    throw err
  }

  const spec = { title: 'Translate 20 docs to FR/ES', prompt: 'Translate & summarize', createdAt: Date.now() }
  const job = await quickstart.postJob(spec)
  fs.writeFileSync(path.join(RECEIPTS_DIR, '01-postJob.json'), JSON.stringify(job, null, 2))

  if (quickstart.acknowledgeTaxPolicy) await quickstart.acknowledgeTaxPolicy()
  if (quickstart.prepareStake) await quickstart.prepareStake('50000000')
  if (quickstart.stake) await quickstart.stake('20000000')

  const submission = await quickstart.submit(job.jobId, 'ipfs://bafybeigdyrplaceholderresultcid')
  fs.writeFileSync(path.join(RECEIPTS_DIR, '02-submit.json'), JSON.stringify(submission, null, 2))

  const validation = await quickstart.validate(job.jobId, true, { skipFinalize: false })
  fs.writeFileSync(path.join(RECEIPTS_DIR, '03-validate.json'), JSON.stringify(validation, null, 2))

  try {
    run('npx ts-node demo/META-AGENTIC-BAZAAR/scripts/write-addresses.ts')
  } catch (err) {
    console.warn('write-addresses.ts failed (optional)', err instanceof Error ? err.message : err)
  }

  try {
    run('npx ts-node demo/META-AGENTIC-BAZAAR/scripts/report.ts')
  } catch (err) {
    console.warn('report.ts failed (optional)', err instanceof Error ? err.message : err)
  }

  console.log('✅ Local demo complete – open the UI and select the Hardhat chain.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
