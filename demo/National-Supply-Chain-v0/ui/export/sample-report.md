# National Supply Chain Sovereign Mission Report

- **Generated:** Oct 16, 2025, 02:13:09 PM UTC
- **Network:** hardhat (chainId 31337)
- **Jobs orchestrated:** 2
- **Total AGIα burned:** 6.175 AGIα
- **Circulating supply:** 13993.825 AGIα

## Strategic orchestration map
```mermaid
flowchart LR
    classDef owner fill:#ffe4e6,stroke:#db2777,stroke-width:2px,color:#4a044e;
    classDef employer fill:#e7f0fe,stroke:#1f6feb,stroke-width:2px,color:#08264c;
    classDef agent fill:#fdf5ff,stroke:#7e22ce,stroke-width:2px,color:#3b0764;
    classDef job fill:#ecfdf3,stroke:#047857,stroke-width:2px,color:#064e3b;
    classDef validators fill:#fff7ed,stroke:#d97706,stroke-width:2px,color:#7c2d12;
    ownerMain["AGI Jobs Sovereign Orchestrator<br/>0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"]:::owner
    validatorCouncil["Validator council<br/>Charlie (validator), Dora (validator), Evan (validator)"]:::validators
    ownerMain -->|Missions orchestrated| job_1
    employer_0x70997970C51812dc3A010C7d01b50e0d17dc79C8 -->|Escrows 250.0 AGIα| job_1
    job_1 -->|Delegates| agent_0x90F79bf6EB2c4f870365E785982E1f101E93b906
    job_1 -->|Validator quorum| validatorCouncil
    validatorCouncil -->|Credential minted (ipfs://agi-jobs/demo/certificates/1)| agent_0x90F79bf6EB2c4f870365E785982E1f101E93b906
    ownerMain -->|Missions orchestrated| job_2
    employer_0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC -->|Escrows 180.0 AGIα| job_2
    job_2 -->|Delegates| agent_0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
    job_2 -->|Validator quorum| validatorCouncil
    validatorCouncil -->|Credential minted (ipfs://agi-jobs/demo/certificates/2)| agent_0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
    job_1["Job #1<br/>Scenario 1 – Arctic resilience corridor stabilized by AI swarm"]:::job
    employer_0x70997970C51812dc3A010C7d01b50e0d17dc79C8["Arctic Climate Directorate (Employer)<br/>0x70997970C51812dc3A010C7d01b50e0d17dc79C8"]:::employer
    agent_0x90F79bf6EB2c4f870365E785982E1f101E93b906["Aurora Logistics AI (AI Agent)<br/>0x90F79bf6EB2c4f870365E785982E1f101E93b906"]:::agent
    job_2["Job #2<br/>Scenario 2 – Pacific disaster relief dispute resolved by owner governance"]:::job
    employer_0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC["Pacific Infrastructure Authority (Employer)<br/>0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"]:::employer
    agent_0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65["Zephyr Relief Swarm (AI Agent)<br/>0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"]:::agent
```

## Executive pulse
| Metric | Value |
| --- | --- |
| Protocol fee | 5% |
| Validator reward | 20% |
| Fee pool pending | 20.425 AGIα |
| Agent stake | 20.0 AGIα |
| Validator stake | 24.9 AGIα |

## Mission automation highlights
The sovereign AGI national supply chain network proved it can be paused, tuned, disputed, and relaunched instantly — even non-technical owners command it through scripted drills and a live control room.

| Score | Value |
| --- | --- |
| Resilience score | 100 |
| Unstoppable index | 100 |
| Jobs tracked | 2 |

### Owner directives
- **Lock CI v2 branch protection** (critical): Run the branch protection verifier so every pull request is blocked unless the CI summary gate and its upstream jobs succeed. → `npm run ci:verify-branch-protection -- --branch main`
- **Replay sovereign mission control drill** (high): Re-run the Hardhat automation to reconfirm fee, burn, quorum, and pause powers any time parameters change or new validators onboard. → `npm run demo:agi-labor-market:control-room`
- **Refresh owner telemetry dashboard** (normal): Publish the owner dashboard so stakeholders see the same unstoppable controls showcased in this run. → `npm run owner:dashboard`

### Automation commands
- Replay: `npm run demo:agi-labor-market`
- Export: `npm run demo:agi-labor-market:export`
- Control room: `npm run demo:agi-labor-market:control-room`
- Owner dashboard: `npm run owner:dashboard`

### Verification guardrails
- ci (v2) / Lint & static checks
- ci (v2) / Tests
- ci (v2) / Foundry
- ci (v2) / Coverage thresholds
- ci (v2) / CI summary

## Owner action log
| Time | Action | Method | Contract | Parameters |
| --- | --- | --- | --- | --- |
| Oct 16, 2025, 02:13:08 PM UTC | Linked certificate to job registry | setJobRegistry | CertificateNFT@0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0 | {"registry":"0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82"} |
| Oct 16, 2025, 02:13:08 PM UTC | Linked certificate to stake manager | setStakeManager | CertificateNFT@0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0 | {"stake":"0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"} |
| Oct 16, 2025, 02:13:08 PM UTC | Connected stake manager fee pool | setFeePool | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"feePool":"0x0B306BF915C4d645ff596e518fAf3F9669b97016"} |
| Oct 16, 2025, 02:13:08 PM UTC | Connected stake modules | setModules | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"registry":"0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82","dispute":"0x9A676e781A523b5d0C0e43731313A708CB607508"} |
| Oct 16, 2025, 02:13:08 PM UTC | Linked stake to validation module | setValidationModule | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"validation":"0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validation module registry link | setJobRegistry | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"registry":"0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validation module identity link | setIdentityRegistry | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"identity":"0x610178dA211FEF7D417bC0e6FeD39F05609AD788"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validation module reputation link | setReputationEngine | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"reputation":"0x8A791620dd6260079BF849Dc5567aDC3F2FdC318"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validation module stake link | setStakeManager | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"stake":"0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"} |
| Oct 16, 2025, 02:13:08 PM UTC | Registry module wiring finalised | setModules | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"validation":"0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e","stake":"0xa513E6E4b8f2a923D98304ec87F64353C4D5C853","reputation":"0x8A791620dd6260079BF849Dc5567aDC3F2FdC318","dispute":"0x9A676e781A523b5d0C0e43731313A708CB607508","certificate":"0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0","feePool":"0x0B306BF915C4d645ff596e518fAf3F9669b97016"} |
| Oct 16, 2025, 02:13:08 PM UTC | Registry identity registry set | setIdentityRegistry | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"identity":"0x610178dA211FEF7D417bC0e6FeD39F05609AD788"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validator reward percentage configured | setValidatorRewardPct | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"pct":20} |
| Oct 16, 2025, 02:13:08 PM UTC | Registry authorised to update reputation | setCaller | ReputationEngine@0x8A791620dd6260079BF849Dc5567aDC3F2FdC318 | {"caller":"0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82","allowed":true} |
| Oct 16, 2025, 02:13:08 PM UTC | Validation authorised to update reputation | setCaller | ReputationEngine@0x8A791620dd6260079BF849Dc5567aDC3F2FdC318 | {"caller":"0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e","allowed":true} |
| Oct 16, 2025, 02:13:08 PM UTC | Dispute module stake link | setStakeManager | DisputeModule@0x9A676e781A523b5d0C0e43731313A708CB607508 | {"stake":"0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"} |
| Oct 16, 2025, 02:13:08 PM UTC | Commit/reveal windows tuned | setCommitRevealWindows | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"commitWindow":60,"revealWindow":60} |
| Oct 16, 2025, 02:13:08 PM UTC | Validator quorum set | setValidatorsPerJob | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"count":3} |
| Oct 16, 2025, 02:13:08 PM UTC | Validator pool curated | setValidatorPool | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"validators":["0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc","0x976EA74026E726554dB657fA54763abd0C3a0aa9","0x14dC79964da2C08b23698B3D3cc7Ca32193d9955"]} |
| Oct 16, 2025, 02:13:08 PM UTC | Reveal quorum configured | setRevealQuorum | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"minYesVotes":0,"minRevealers":2} |
| Oct 16, 2025, 02:13:08 PM UTC | Non-reveal penalty set | setNonRevealPenalty | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"penaltyBps":100,"penaltyDivisor":1} |
| Oct 16, 2025, 02:13:08 PM UTC | Fee pool burn percentage adjusted | setBurnPct | FeePool@0x0B306BF915C4d645ff596e518fAf3F9669b97016 | {"burnPct":5} |
| Oct 16, 2025, 02:13:08 PM UTC | Certificate base URI set | setBaseURI | CertificateNFT@0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0 | {"baseURI":"ipfs://agi-jobs/demo/certificates/"} |
| Oct 16, 2025, 02:13:08 PM UTC | Emergency AI agent allowlisted | addAdditionalAgent | IdentityRegistry@0x610178dA211FEF7D417bC0e6FeD39F05609AD788 | {"agent":"0x90F79bf6EB2c4f870365E785982E1f101E93b906"} |
| Oct 16, 2025, 02:13:08 PM UTC | Agent type annotated | setAgentType | IdentityRegistry@0x610178dA211FEF7D417bC0e6FeD39F05609AD788 | {"agent":"0x90F79bf6EB2c4f870365E785982E1f101E93b906","agentType":1} |
| Oct 16, 2025, 02:13:08 PM UTC | Emergency AI agent allowlisted | addAdditionalAgent | IdentityRegistry@0x610178dA211FEF7D417bC0e6FeD39F05609AD788 | {"agent":"0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"} |
| Oct 16, 2025, 02:13:08 PM UTC | Agent type annotated | setAgentType | IdentityRegistry@0x610178dA211FEF7D417bC0e6FeD39F05609AD788 | {"agent":"0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65","agentType":1} |
| Oct 16, 2025, 02:13:08 PM UTC | Validator council seat granted | addAdditionalValidator | IdentityRegistry@0x610178dA211FEF7D417bC0e6FeD39F05609AD788 | {"validator":"0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validator council seat granted | addAdditionalValidator | IdentityRegistry@0x610178dA211FEF7D417bC0e6FeD39F05609AD788 | {"validator":"0x976EA74026E726554dB657fA54763abd0C3a0aa9"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validator council seat granted | addAdditionalValidator | IdentityRegistry@0x610178dA211FEF7D417bC0e6FeD39F05609AD788 | {"validator":"0x14dC79964da2C08b23698B3D3cc7Ca32193d9955"} |
| Oct 16, 2025, 02:13:08 PM UTC | Protocol fee temporarily increased | setFeePct | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"previous":5,"pct":9} |
| Oct 16, 2025, 02:13:08 PM UTC | Validator rewards boosted | setValidatorRewardPct | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"previous":20,"pct":25} |
| Oct 16, 2025, 02:13:08 PM UTC | Fee pool burn widened | setBurnPct | FeePool@0x0B306BF915C4d645ff596e518fAf3F9669b97016 | {"previous":5,"burnPct":6} |
| Oct 16, 2025, 02:13:08 PM UTC | Commit/reveal windows extended | setCommitRevealWindows | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"previousCommitWindow":"60s","previousRevealWindow":"60s","commitWindow":"90s","revealWindow":"90s"} |
| Oct 16, 2025, 02:13:08 PM UTC | Reveal quorum tightened | setRevealQuorum | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"previousPct":0,"previousMinRevealers":2,"pct":50,"minRevealers":2} |
| Oct 16, 2025, 02:13:08 PM UTC | Non-reveal penalty escalated | setNonRevealPenalty | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"previousBps":100,"previousBanBlocks":1,"bps":150,"banBlocks":12} |
| Oct 16, 2025, 02:13:08 PM UTC | Stake treasury candidate allowlisted | setTreasuryAllowlist | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"treasury":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","allowed":true} |
| Oct 16, 2025, 02:13:08 PM UTC | Stake treasury rerouted | setTreasury | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"treasury":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8"} |
| Oct 16, 2025, 02:13:08 PM UTC | Minimum stake raised | setMinStake | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"previous":"1.0 AGIα","minStake":"6.0 AGIα"} |
| Oct 16, 2025, 02:13:08 PM UTC | Maximum stake per address tuned | setMaxStakePerAddress | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"previous":"Unlimited","maxStake":"1000.0 AGIα"} |
| Oct 16, 2025, 02:13:08 PM UTC | Unbonding period extended | setUnbondingPeriod | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"previous":"604800s","unbondingPeriod":"608400s"} |
| Oct 16, 2025, 02:13:08 PM UTC | Stake pauser manager delegated | setPauserManager | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"manager":"0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"} |
| Oct 16, 2025, 02:13:08 PM UTC | Fee pool treasury allowlisted | setTreasuryAllowlist | FeePool@0x0B306BF915C4d645ff596e518fAf3F9669b97016 | {"treasury":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC","allowed":true} |
| Oct 16, 2025, 02:13:08 PM UTC | Fee pool treasury rerouted | setTreasury | FeePool@0x0B306BF915C4d645ff596e518fAf3F9669b97016 | {"treasury":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"} |
| Oct 16, 2025, 02:13:08 PM UTC | Registry pauser delegated | setPauser | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"newPauser":"0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"} |
| Oct 16, 2025, 02:13:08 PM UTC | Stake manager pauser delegated | setPauser | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"newPauser":"0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validation module pauser delegated | setPauser | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"newPauser":"0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"} |
| Oct 16, 2025, 02:13:08 PM UTC | Registry paused for drill | pause | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"by":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"} |
| Oct 16, 2025, 02:13:08 PM UTC | Stake manager paused for drill | pause | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"by":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validation module paused for drill | pause | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"by":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"} |
| Oct 16, 2025, 02:13:08 PM UTC | Registry unpaused after drill | unpause | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"by":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"} |
| Oct 16, 2025, 02:13:08 PM UTC | Stake manager unpaused after drill | unpause | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"by":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validation module unpaused after drill | unpause | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"by":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"} |
| Oct 16, 2025, 02:13:08 PM UTC | Registry paused by delegated moderator | pause | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"by":"0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"} |
| Oct 16, 2025, 02:13:08 PM UTC | Stake manager paused by delegated moderator | pause | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"by":"0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validation module paused by delegated moderator | pause | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"by":"0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"} |
| Oct 16, 2025, 02:13:08 PM UTC | Registry unpaused by delegated moderator | unpause | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"by":"0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"} |
| Oct 16, 2025, 02:13:08 PM UTC | Stake manager unpaused by delegated moderator | unpause | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"by":"0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validation module unpaused by delegated moderator | unpause | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"by":"0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"} |
| Oct 16, 2025, 02:13:08 PM UTC | Protocol fee restored | setFeePct | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"pct":5} |
| Oct 16, 2025, 02:13:08 PM UTC | Validator reward restored | setValidatorRewardPct | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"pct":20} |
| Oct 16, 2025, 02:13:08 PM UTC | Fee pool burn restored | setBurnPct | FeePool@0x0B306BF915C4d645ff596e518fAf3F9669b97016 | {"burnPct":5} |
| Oct 16, 2025, 02:13:08 PM UTC | Commit/reveal cadence restored | setCommitRevealWindows | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"commitWindow":"60s","revealWindow":"60s"} |
| Oct 16, 2025, 02:13:08 PM UTC | Reveal quorum restored | setRevealQuorum | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"pct":0,"minRevealers":2} |
| Oct 16, 2025, 02:13:08 PM UTC | Non-reveal penalty restored | setNonRevealPenalty | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"bps":100,"banBlocks":1} |
| Oct 16, 2025, 02:13:08 PM UTC | Minimum stake restored | setMinStake | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"minStake":"1.0 AGIα"} |
| Oct 16, 2025, 02:13:08 PM UTC | Maximum stake per address restored | setMaxStakePerAddress | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"maxStake":"Unlimited"} |
| Oct 16, 2025, 02:13:08 PM UTC | Unbonding period restored | setUnbondingPeriod | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"unbondingPeriod":"604800s"} |
| Oct 16, 2025, 02:13:08 PM UTC | Stake treasury restored | setTreasury | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"treasury":"0x0000000000000000000000000000000000000000"} |
| Oct 16, 2025, 02:13:08 PM UTC | Stake treasury candidate revoked | setTreasuryAllowlist | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"treasury":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","allowed":false} |
| Oct 16, 2025, 02:13:08 PM UTC | Stake pauser manager restored | setPauserManager | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"manager":"0x0000000000000000000000000000000000000000"} |
| Oct 16, 2025, 02:13:08 PM UTC | Fee pool treasury restored | setTreasury | FeePool@0x0B306BF915C4d645ff596e518fAf3F9669b97016 | {"treasury":"0x0000000000000000000000000000000000000000"} |
| Oct 16, 2025, 02:13:08 PM UTC | Fee pool treasury candidate revoked | setTreasuryAllowlist | FeePool@0x0B306BF915C4d645ff596e518fAf3F9669b97016 | {"treasury":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC","allowed":false} |
| Oct 16, 2025, 02:13:08 PM UTC | Registry pauser returned to owner | setPauser | JobRegistry@0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 | {"newPauser":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"} |
| Oct 16, 2025, 02:13:08 PM UTC | Stake manager pauser returned to owner | setPauser | StakeManager@0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 | {"newPauser":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"} |
| Oct 16, 2025, 02:13:08 PM UTC | Validation module pauser returned to owner | setPauser | ValidationModule@0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e | {"newPauser":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"} |
| Oct 16, 2025, 02:13:08 PM UTC | Dispute fee waived for demonstration | setDisputeFee | DisputeModule@0x9A676e781A523b5d0C0e43731313A708CB607508 | {"fee":0} |
| Oct 16, 2025, 02:13:08 PM UTC | Dispute window accelerated | setDisputeWindow | DisputeModule@0x9A676e781A523b5d0C0e43731313A708CB607508 | {"window":0} |
| Oct 16, 2025, 02:13:08 PM UTC | Owner enrolled as dispute moderator | setModerator | DisputeModule@0x9A676e781A523b5d0C0e43731313A708CB607508 | {"moderator":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","enabled":1} |
| Oct 16, 2025, 02:13:08 PM UTC | External moderator empowered | setModerator | DisputeModule@0x9A676e781A523b5d0C0e43731313A708CB607508 | {"moderator":"0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f","enabled":1} |

## Agent and validator capital
| Role | Name | Liquid | Stake | Locked | Reputation | Credentials |
| Agent | Aurora Logistics AI (agent) | 2190.0 AGIα | 10.0 AGIα | 0.0 AGIα | 145 | 1 (ipfs://agi-jobs/demo/certificates/1) |
| Agent | Zephyr Relief Swarm (agent) | 2170.0 AGIα | 10.0 AGIα | 0.0 AGIα | 145 | 2 (ipfs://agi-jobs/demo/certificates/2) |
| Validator | Charlie (validator) | 2006.666666666666666666 AGIα | 5.0 AGIα | 0.0 AGIα | 9 | — |
| Validator | Dora (validator) | 2006.666666666666666666 AGIα | 10.0 AGIα | 0.0 AGIα | 10 | — |
| Validator | Evan (validator) | 2006.666666666666666668 AGIα | 9.9 AGIα | 0.0 AGIα | 9 | — |

## Owner control drill outcomes
| Setting | Baseline | Live drill | Restored |
| Protocol fee | 5% | 9% | 5% |
| Validator reward | 20% | 25% | 20% |
| Fee burn | 5% | 6% | 5% |
| Commit window | 60s | 90s | 60s |
| Reveal window | 60s | 90s | 60s |
| Reveal quorum | 0% | 50% | 0% |
| Minimum revealers | 2 | 2 | 2 |
| Non-reveal penalty | 100 bps | 150 bps | 100 bps |
| Non-reveal ban | 1 | 12 | 1 |
| Minimum stake | 1.0 AGIα | 6.0 AGIα | 1.0 AGIα |
| Max stake per address | Unlimited | 1000.0 AGIα | Unlimited |
| Unbonding period | 604800s | 608400s | 604800s |

### Pause drills
- Owner drill: ✅ registry, ✅ stake, ✅ validation
- Moderator drill: ✅ registry, ✅ stake, ✅ validation

### Sovereign control matrix
- **JobRegistry** at 0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82 → delegated to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266. Capabilities: Tune protocol fee and validator reward split on demand, Delegate or reclaim registry pauser authority (current delegate: 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f), Finalize jobs, burn receipts, and steer dispute escalations. Status: Owner holds sovereign registry control after drill.
- **StakeManager** at 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 → delegated to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266. Capabilities: Set minimum stake, withdrawal delays, and max stake per participant, Route treasury flows and revoke allowlisted recipients instantly, Assign stake pauser and pauser manager (baseline manager: 0x0000000000000000000000000000000000000000). Status: Treasury routed through 0x0000000000000000000000000000000000000000 with owner overrides.
- **ValidationModule** at 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e → delegated to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266. Capabilities: Set commit/reveal cadence and quorum thresholds, Escalate non-reveal penalties and ban windows, Delegate validation pauser authority (current delegate: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266). Status: Validation cadence restored after governance rehearsal.
- **FeePool** at 0x0B306BF915C4d645ff596e518fAf3F9669b97016 → delegated to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266. Capabilities: Adjust burn percentage for protocol fees, Allowlist community treasuries and reroute dust rewards, Coordinate with StakeManager for validator compensation. Status: Treasury baseline 0x0000000000000000000000000000000000000000 with allowlist=false.
- **DisputeModule** at 0x9A676e781A523b5d0C0e43731313A708CB607508 → delegated to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266. Capabilities: Appoint or remove dispute moderators and councils, Set dispute fees and response windows, Execute resolution signatures for contentious jobs. Status: Owner + moderator (0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f) co-sign dispute verdicts.
- **CertificateNFT** at 0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0 → delegated to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266. Capabilities: Configure credential metadata URIs, Mint proof-of-work credentials during job finalization. Status: Credential issuance verified for both scenarios.
- **IdentityRegistry** at 0x610178dA211FEF7D417bC0e6FeD39F05609AD788 → delegated to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266. Capabilities: Allowlist agents and validators for emergency onboarding, Annotate agent types and sync ENS identities, Revoke or restore actors outside ENS flows. Status: Emergency council identities seeded for the drill.
- **ReputationEngine** at 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318 → delegated to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266. Capabilities: Reset or checkpoint reputation scores during crisis response, Verify validator performance after disputes. Status: Reputation states captured in telemetry dashboard.

## Insights timeline snapshot
- **Economy: Actors funded with sovereign AGIα liquidity** (Oct 16, 2025, 02:13:07 PM UTC) – Seeded 2000.0 AGIα to every employer, agent, and validator so the national supply chain network simulation mirrors production runway balances.
- **Owner: Owner rerouted treasuries and fortified staking safety rails** (Oct 16, 2025, 02:13:08 PM UTC) – Treasury flows now route through allied nations while minimum stake, withdrawal delays, and pauser management prove the platform owner can harden capital instantly.
- **Owner: Owner executed full-spectrum command drill** (Oct 16, 2025, 02:13:08 PM UTC) – Protocol fees, validator incentives, burn cadence, and emergency pause delegates were adjusted, rehearsed, and restored without incident.
- **Agents: Cooperative climate coalition completed flawlessly** (Oct 16, 2025, 02:13:08 PM UTC) – Arctic Climate Directorate, Aurora Logistics AI, and the validator council finalized the coordination mandate with unanimous approval and credential issuance.
- **Disputes: Dispute resolution rewarded Zephyr Relief Swarm and disciplined validators** (Oct 16, 2025, 02:13:08 PM UTC) – Owner governance waived dispute fees, moderators co-signed the verdict, and the validator who withheld their reveal was slashed while Zephyr Relief Swarm still graduated.
- **Economy: Market telemetry verified end-to-end** (Oct 16, 2025, 02:13:09 PM UTC) – Fee pool balances, burn accounting, and credential issuance matched the sovereign market invariants.
- **Owner: Autonomous control plan ready for execution** (Oct 16, 2025, 02:13:09 PM UTC) – A machine-readable playbook now prescribes owner commands, validator discipline, treasury distribution, and CI guardrails.

## Initial timeline excerpt
- Oct 16, 2025, 02:13:07 PM UTC: Bootstrapping AGI Jobs v2 grand demo environment
- Oct 16, 2025, 02:13:07 PM UTC: Demo actor roster initialised
- Oct 16, 2025, 02:13:07 PM UTC: Initial AGIα liquidity minted to actors
- Oct 16, 2025, 02:13:07 PM UTC: Actors funded with sovereign AGIα liquidity
- Oct 16, 2025, 02:13:07 PM UTC: Deploying core contracts
- Oct 16, 2025, 02:13:07 PM UTC: StakeManager deployed
- Oct 16, 2025, 02:13:07 PM UTC: ReputationEngine deployed
- Oct 16, 2025, 02:13:08 PM UTC: IdentityRegistry deployed
- Oct 16, 2025, 02:13:08 PM UTC: ValidationModule deployed
- Oct 16, 2025, 02:13:08 PM UTC: CertificateNFT deployed
- Oct 16, 2025, 02:13:08 PM UTC: JobRegistry deployed
- Oct 16, 2025, 02:13:08 PM UTC: DisputeModule deployed
