# Disputes

Jobs may be contested by either the employer or the agent. The
`JobRegistry` forwards disputes to whichever `IDisputeModule` is
currently active. The default moderator-driven module requires majority
approval from a set of trusted moderators before a dispute can be
resolved.

For external arbitration the project includes `KlerosDisputeModule`.
Governance can deploy this contract and activate it via
`JobRegistry.setDisputeModule`. It relays disputes to an off-chain
arbitration service such as Kleros and expects the arbitrator to call
back with the final ruling. Once a ruling is returned the job is
finalised and escrowed funds are distributed according to the decision.

## Evidence workflow

During an active dispute any job participant or validator assigned to the
committee can broadcast supplemental evidence using
`DisputeModule.submitEvidence`. The function only emits the
`EvidenceSubmitted` event so that log indexers (subgraph, monitoring, and the
DAO) can review counter-claims without incurring additional storage costs. The
validator CLI exposes this via `validator-cli challenge respond <jobId>` which
either publishes a keccak256 hash for off-chain blobs or an inline URI/summary.
