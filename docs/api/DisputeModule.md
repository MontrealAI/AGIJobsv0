# DisputeModule API

Handles disputes raised against jobs.

## Functions
- `setModerator(address moderator)` – owner sets privileged moderator.
- `raiseDispute(uint256 jobId)` – anyone opens a dispute on a job.
- `resolve(uint256 jobId, bool employerWins)` – moderator settles the dispute and redistributes stakes.

## Events
- `DisputeRaised(uint256 indexed jobId, address indexed claimant)`
- `DisputeResolved(uint256 indexed jobId, bool employerWins)`
- `ModeratorUpdated(address indexed moderator)`
