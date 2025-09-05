# DisputeModule API

Handles disputes raised against jobs. A governance timelock or multisig manages
the list of eligible moderators who must reach majority consensus to finalise a
case.

## Functions

- `addModerator(address moderator)` – governance enrols a new moderator.
- `removeModerator(address moderator)` – governance removes a moderator.
- `setGovernance(address governance)` – hand off control to a new timelock or multisig.
- `raiseDispute(uint256 jobId)` – JobRegistry forwards a dispute from a participant.
- `resolve(uint256 jobId, bool employerWins)` – moderators vote; majority decides.

## Events

- `DisputeRaised(uint256 indexed jobId, address indexed claimant, bytes32 indexed evidenceHash, string evidence)`
- `DisputeResolved(uint256 indexed jobId, bool employerWins)`
- `ModeratorAdded(address indexed moderator)`
- `ModeratorRemoved(address indexed moderator)`
- `GovernanceUpdated(address indexed governance)`

## Quorum

`resolve` requires more than half of `moderatorCount` votes. The default
deployment boots the governance address as the first moderator, so onboarding
additional members is the first action for governance.
