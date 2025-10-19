# α-AGI Governance Mission Timeline



Network: `hardhat`



## Step 1: Deployed MockVotesToken
- Actor: **Owner**
- Timestamp: 2025-10-19T12:59:45.000Z
    - **address:** 0x5FbDB2315678afecb367f032d93F642f64180aa3

## Step 2: Deployed AGI Governor and Timelock
- Actor: **Owner**
- Timestamp: 2025-10-19T12:59:52.000Z
    - **governor:** 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
    - **timelock:** 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
    - **votingDelayBlocks:** 1
    - **votingPeriodBlocks:** 12
    - **proposalThreshold:** 100.0
    - **quorumFraction:** 8

## Step 3: Deployed Quadratic Voting Exchange
- Actor: **Owner**
- Timestamp: 2025-10-19T12:59:54.000Z
    - **address:** 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
    - **treasury:** 0x70997970C51812dc3A010C7d01b50e0d17dc79C8

## Step 4: Deployed Global Governance Council
- Actor: **Owner**
- Timestamp: 2025-10-19T12:59:55.000Z
    - **address:** 0x610178dA211FEF7D417bC0e6FeD39F05609AD788
    - **pauserRole:** 0x6dcb5463bfa055273780ceb39c78d29754fe7aa20ee029e34643838de59592d5

## Step 5: Minted and Delegated Governance Power
- Actor: **Owner**
- Timestamp: 2025-10-19T13:00:07.000Z
    - **totalSupply:** 3750000.0
    - **allocations:** [{"actor":"Owner","amount":"1500000.0"},{"actor":"Aurora Accord","amount":"600000.0"},{"actor":"Pacific Mesh","amount":"550000.0"},{"actor":"Atlas Coalition","amount":"500000.0"},{"actor":"Treasury","amount":"250000.0"},{"actor":"Validator","amount":"350000.0"}]

## Step 6: Registered Sovereign AGI Nations
- Actor: **Owner**
- Timestamp: 2025-10-19T13:00:10.000Z
    - **0:** {"id":"NATION_AURORA","governor":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC","weight":3200,"metadata":"ipfs://aurora-governance"}
    - **1:** {"id":"NATION_PACIFIC","governor":"0x90F79bf6EB2c4f870365E785982E1f101E93b906","weight":3000,"metadata":"ipfs://pacific-governance"}
    - **2:** {"id":"NATION_ATLAS","governor":"0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65","weight":2800,"metadata":"ipfs://atlas-governance"}

## Step 7: Transferred Council Ownership to Timelock
- Actor: **Owner**
- Timestamp: 2025-10-19T13:00:11.000Z
    - **newOwner:** 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

## Step 8: Quadratic Voting Session Executed
- Actor: **QuadraticVoting**
- Timestamp: 2025-10-19T13:00:20.000Z
    - **proposalId:** 1
    - **voters:** [{"actor":"Aurora Accord","votes":"80"},{"actor":"Pacific Mesh","votes":"72"},{"actor":"Atlas Coalition","votes":"65"},{"actor":"Validator","votes":"40"}]
    - **totalCost:** 0.000000000000017409

## Step 9: Executed Proposal 1: Rotated Pauser and Paused Council
- Actor: **Governor**
- Timestamp: 2025-10-21T13:00:45.000Z
    - **proposalId:** 77737806022528169253995463494489538247803343552825016304675323786673903782084
    - **paused:** true
    - **pauserRole:** 0xb980995f306416142a47e9a05eefbe7dd50f87556dc2ce0ceffcf99bfc5e65e2

## Step 10: Executed Proposal 2: Council Reactivated and Nation Weight Elevated
- Actor: **Governor**
- Timestamp: 2025-10-23T13:01:10.000Z
    - **proposalId:** 102236027557560357670766004197036435724142098012165498335742848034448024831420
    - **paused:** false
    - **updatedNationWeight:** 3650

## Step 11: Computed Thermodynamic Diagnostics
- Actor: **Analysis Engine**
- Timestamp: 2025-10-23T13:01:10.000Z
    - **hamiltonianEnergy:** 17409
    - **freeEnergyDelta:** 17070.28620533123
    - **entropyIndex:** 1.0920967102007695
    - **landauerRatio:** 5.865341402490716e+24
    - **monteCarloEntropyMean:** 1.0919964102040625
    - **monteCarloEntropyStd:** 0.0007772648738002258

## Step 12: Captured Final State Snapshot
- Actor: **Observer**
- Timestamp: 2025-10-23T13:01:10.000Z
    - **network:** hardhat
    - **governor:** 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
    - **timelock:** 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
    - **quadraticVoting:** 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
    - **governanceCouncil:** 0x610178dA211FEF7D417bC0e6FeD39F05609AD788
    - **pauserRole:** 0xb980995f306416142a47e9a05eefbe7dd50f87556dc2ce0ceffcf99bfc5e65e2
    - **paused:** false
    - **treasury:** 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
    - **treasuryBalance:** 250000.0
    - **proposalCount:** 2
    - **nations:** [{"id":"NATION_AURORA","governor":"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC","votingWeight":3650,"active":true,"metadataURI":"ipfs://aurora-governance"},{"id":"NATION_PACIFIC","governor":"0x90F79bf6EB2c4f870365E785982E1f101E93b906","votingWeight":3000,"active":true,"metadataURI":"ipfs://pacific-governance"},{"id":"NATION_ATLAS","governor":"0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65","votingWeight":2800,"active":true,"metadataURI":"ipfs://atlas-governance"}]
