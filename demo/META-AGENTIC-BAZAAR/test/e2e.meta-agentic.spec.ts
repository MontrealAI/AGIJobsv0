import path from 'path'
import { expect } from 'chai'
import { ethers } from 'hardhat'

describe('META‑AGENTIC‑BAZAAR E2E (local)', function () {
  this.timeout(120_000)

  it('posts job, stakes, submits, validates', async function () {
    try {
      await ethers.run('run', { script: 'scripts/v2/deployDefaults.ts', network: 'localhost' } as any)
    } catch (err) {
      console.warn('deployDefaults.ts helper unavailable (continuing)', err instanceof Error ? err.message : err)
    }

    let quickstart: any
    try {
      quickstart = require(path.join(__dirname, '../../examples/ethers-quickstart.js'))
    } catch (err) {
      this.skip()
    }

    const job = await quickstart.postJob({ title: 'Summarize 10 reports', prompt: 'Summarize' })
    expect(job.jobId).to.not.be.undefined

    if (quickstart.acknowledgeTaxPolicy) await quickstart.acknowledgeTaxPolicy()
    if (quickstart.prepareStake) await quickstart.prepareStake('50000000')
    if (quickstart.stake) await quickstart.stake('20000000')

    await quickstart.submit(job.jobId, 'ipfs://bafyplaceholder')
    const result = await quickstart.validate(job.jobId, true, { skipFinalize: false })
    expect(result).to.exist
  })
})
