# Owner Safe Transaction Kit

Coverage 100.0% across 6 transaction(s).
Network: Ethereum Mainnet (chainId 1)
Integrity hash: 81198e01f2c0478ac27e212913b9e9ae479011facbcfec1295a57eca066cc367

## Safe breakdown
- owner: 0
- governance: 6
- treasury: 0

## Recommended actions
- Execute the encoded transactions to accelerate velocity and reinforce governance control.

## Compress job duration limit (job-registry-duration)
- Safe: Governance Safe (0xAGIJobsGovernor0000000000000000000000003)
- Contract: JobRegistry (0xA100000000000000000000000000000000000001)
- Module: JobRegistry (active)
- Function: `function setJobDurationLimit(uint256)`
- Value: 0.0 ETH (0 wei)
- Selector: 0x17a65137
- CLI: `npx @safe-global/cli transactions propose --safe-address 0xAGIJobsGovernor0000000000000000000000003 --chain-id 1 --to 0xA100000000000000000000000000000000000001 --value 0 --data 0x17a651370000000000000000000000000000000000000000000000000000000000000030`
- Tags: parameters, velocity
- Prerequisites:
  - Confirm validator committees can handle increased cadence
  - Notify agent mesh of updated SLA prior to execution
- Custody: Owner-controlled
- Last audit lag: 20 day(s)
- Checksum: 75abb4ac2da74c0ded6efad2b03ad2121f3bf35b59d8bde6def3a46b95101797

## Elevate validator reward share (stake-manager-reward)
- Safe: Governance Safe (0xAGIJobsGovernor0000000000000000000000003)
- Contract: StakeManager (0xA100000000000000000000000000000000000002)
- Module: StakeManager (active)
- Function: `function setValidatorRewardPct(uint256)`
- Value: 0.0 ETH (0 wei)
- Selector: 0x04ffdbaf
- CLI: `npx @safe-global/cli transactions propose --safe-address 0xAGIJobsGovernor0000000000000000000000003 --chain-id 1 --to 0xA100000000000000000000000000000000000002 --value 0 --data 0x04ffdbaf00000000000000000000000000000000000000000000000000000000000004b0`
- Tags: validators, incentives
- Prerequisites:
  - Verify treasury liquidity covers increased validator yield
  - Alert validator constellation of new reward rate
- Custody: Owner-controlled
- Last audit lag: 28 day(s)
- Checksum: b517d7aa39074abb05bcd0dc8f729111b1ad641aae259e4ad1b1eb410d2f41a3

## Expand validator quorum window (validation-module-bounds)
- Safe: Governance Safe (0xAGIJobsGovernor0000000000000000000000003)
- Contract: ValidationModule (0xA100000000000000000000000000000000000003)
- Module: ValidationModule (pending-upgrade)
- Function: `function setValidatorBounds(uint256,uint256)`
- Value: 0.0 ETH (0 wei)
- Selector: 0xc14447e2
- CLI: `npx @safe-global/cli transactions propose --safe-address 0xAGIJobsGovernor0000000000000000000000003 --chain-id 1 --to 0xA100000000000000000000000000000000000003 --value 0 --data 0xc14447e200000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000007`
- Tags: validators, security
- Prerequisites:
  - Confirm committee selection cache warmed for new bounds
  - Align dispute module juries with expanded quorum
- Custody: Owner-controlled
- Last audit lag: 48 day(s)
- Checksum: e65356a428a89e9336f4c5347489e8c96c091c6c553043a451a12e490d65de06

## Tune reputation scoring weights (reputation-engine-weights)
- Safe: Governance Safe (0xAGIJobsGovernor0000000000000000000000003)
- Contract: ReputationEngine (0xA100000000000000000000000000000000000004)
- Module: ReputationEngine (active)
- Function: `function setScoringWeights(uint256,uint256)`
- Value: 0.0 ETH (0 wei)
- Selector: 0x6d876aeb
- CLI: `npx @safe-global/cli transactions propose --safe-address 0xAGIJobsGovernor0000000000000000000000003 --chain-id 1 --to 0xA100000000000000000000000000000000000004 --value 0 --data 0x6d876aeb000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000000000000000000000000000000000000000000028`
- Tags: reputation, validators
- Prerequisites:
  - Validate new weighting with analytics dashboard
  - Notify agent operators of updated reputation policy
- Custody: Owner-controlled
- Last audit lag: 35 day(s)
- Checksum: 80393e6b54d7b466ea774adc8f826377411ce7ce9b2becaa7ac61d8b85e5a228

## Recalibrate dispute window (dispute-module-window)
- Safe: Governance Safe (0xAGIJobsGovernor0000000000000000000000003)
- Contract: DisputeModule (0xA100000000000000000000000000000000000005)
- Module: DisputeModule (active)
- Function: `function setDisputeWindow(uint256)`
- Value: 0.0 ETH (0 wei)
- Selector: 0x332226d0
- CLI: `npx @safe-global/cli transactions propose --safe-address 0xAGIJobsGovernor0000000000000000000000003 --chain-id 1 --to 0xA100000000000000000000000000000000000005 --value 0 --data 0x332226d00000000000000000000000000000000000000000000000000000000000015180`
- Tags: disputes, security
- Prerequisites:
  - Verify validator committee availability for shortened windows
  - Publish updated dispute SLA to stakeholders
- Custody: Owner-controlled
- Last audit lag: 23 day(s)
- Checksum: 6aff21935f6d58a7f7682fa42e1628d8b19e9f23319eec4a7f972a68c6888661

## Refresh certificate metadata base URI (certificate-nft-base-uri)
- Safe: Governance Safe (0xAGIJobsGovernor0000000000000000000000003)
- Contract: CertificateNFT (0xA100000000000000000000000000000000000006)
- Module: CertificateNFT (active)
- Function: `function setBaseURI(string)`
- Value: 0.0 ETH (0 wei)
- Selector: 0x55f804b3
- CLI: `npx @safe-global/cli transactions propose --safe-address 0xAGIJobsGovernor0000000000000000000000003 --chain-id 1 --to 0xA100000000000000000000000000000000000006 --value 0 --data 0x55f804b30000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001b697066733a2f2f62616679626569676479726d657461646174612f0000000000`
- Tags: compliance, metadata
- Prerequisites:
  - Upload audited metadata package to IPFS
  - Run certificate indexer resync after execution
- Custody: Owner-controlled
- Last audit lag: 30 day(s)
- Checksum: 66919895dc54810be13801ca75333cd08eb681b37047df7baf2592cbe774b014

