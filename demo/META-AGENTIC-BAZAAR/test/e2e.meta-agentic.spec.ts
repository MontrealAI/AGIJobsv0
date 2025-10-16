import { expect } from 'chai'
import { ethers } from 'hardhat'
import hre from 'hardhat'

describe('META‑AGENTIC‑BAZAAR E2E (local)', function () {
  this.timeout(120000)

  it('posts job, stakes, submits, validates', async function () {
    await hre.run('run', { script: 'scripts/v2/deployDefaults.ts', network: 'localhost' } as any).catch(() => {})

    let qs: any
    try {
      qs = require('../../examples/ethers-quickstart.js')
    } catch (err) {
      this.skip()
      return
    }

    const job = await qs.postJob({ title: 'Summarize 10 reports', prompt: 'Summarize' })
    expect(job.jobId).to.be.a('number')
    await qs.acknowledgeTaxPolicy?.()
    await qs.prepareStake?.('50000000')
    await qs.stake?.('20000000')
    await qs.submit(job.jobId, 'ipfs://bafy...')
    const res = await qs.validate(job.jobId, true, { skipFinalize: false })
    expect(res).to.exist
  })
})
