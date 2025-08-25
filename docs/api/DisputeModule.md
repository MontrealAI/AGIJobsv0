# DisputeModule API

Handles disputes raised against jobs. A committee multisig manages the list of
eligible moderators who must reach majority consensus to finalise a case.

## Functions
- `addModerator(address moderator)` – committee enrols a new moderator.
- `removeModerator(address moderator)` – committee removes a moderator.
- `setCommittee(address committee)` – hand off committee control to a new multisig.
- `raiseDispute(uint256 jobId)` – JobRegistry forwards a dispute from a participant.
- `resolve(uint256 jobId, bool employerWins)` – moderators vote; majority decides.

## Events
- `DisputeRaised(uint256 indexed jobId, address indexed claimant)`
- `DisputeResolved(uint256 indexed jobId, bool employerWins)`
- `ModeratorAdded(address indexed moderator)`
- `ModeratorRemoved(address indexed moderator)`
- `CommitteeUpdated(address indexed committee)`

## Quorum
`resolve` requires more than half of `moderatorCount` votes. The default
deployment boots the committee address as the first moderator, so onboarding
additional members is the first action for the committee multisig.
