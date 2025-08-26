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
