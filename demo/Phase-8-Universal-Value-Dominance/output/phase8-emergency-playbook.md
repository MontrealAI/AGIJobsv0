# Phase 8 — Emergency Response Playbook
Generated: 2025-10-25T00:44:27.944Z

## Control overview
- Guardian council: 0x4c3ab8173d97d58b0daa9f73a2e3e87a4fe98c87
- System pause contract: 0xdd1f26bcb5d0faa1a69729db849bb4c276c74e5c
- Phase8 manager (set via env): 0x0000000000000000000000000000000000000000
- Guardian review window: 720s
- Fastest emergency reaction: immediate · 2/3 protocols route through system pause

## Execution quick steps
1. Convene guardian council multi-sig with quorum.
2. Load the encoded calldata bundle or prepare manual transactions as outlined below.
3. Broadcast incident notice to Mission Control and domain operators.
4. Execute protocol-specific calldata; log tx hashes in incident channel.
5. Maintain override window for human review then coordinate staged unpause.

## Protocol registry
| Protocol | Trigger | Action | Authority | Contract | Function | Reaction | Targets | Communications | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Guardian Council · Superpause | Any sentinel escalates to critical severity or drawdown exceeds the maxDrawdown guard. | Submit forwardPauseCall(systemPause, pauseAll()) via the Phase8 manager to freeze every module instantly. | 0x4c3ab8173d97d58b0daa9f73a2e3e87a4fe98c87 | 0xdd1f26bcb5d0faa1a69729db849bb4c276c74e5c | pauseAll() | 0s | all | Notify Guardian Council war-room and Mission Control bridge immediately. | Full lattice stop; resume only after guardian attestations and validator quorum sign-off. |
| Domain Isolation · Planetary Finance | Planetary Finance Mesh sentinel emits anomaly > 400 bps or TVL drawdown breaches 20%. | Call forwardPauseCall(systemPause, pauseDomain(keccak256("planetary-finance"))) to isolate the domain. | 0x4c3ab8173d97d58b0daa9f73a2e3e87a4fe98c87 | 0xdd1f26bcb5d0faa1a69729db849bb4c276c74e5c | pauseDomain(bytes32 domainId) | 900s | planetary-finance (0xd9e39c30…) | Guardian council posts override window (15 minutes) to Finance Dominion Ops channel. | Keeps the rest of the dominion lattice live while finance undergoes rapid audit. |
| Capital Stream Freeze · Planetary Resilience Fund | Guardian Council vote to redirect treasury following sentinel misuse report or policy shift. | Invoke setCapitalStreamActive(planetary-resilience, false) then forwardPauseCall for dependent domains. | 0x4c3ab8173d97d58b0daa9f73a2e3e87a4fe98c87 | 0x3e8b71da4c5e981a2d4facfe97b53bd2736d1d10 | setCapitalStreamActive(bytes32 streamId, bool active) | 3600s | planetary-finance (0xd9e39c30…)<br>health-sovereign (0x0a59527e…)<br>knowledge-lattice (0x32c88df4…) | Upgrade Coordinator dispatch posts updated funding matrix to Mission Control + Treasury Ops. | Suspends disbursements while new vault routing is approved; resumes only after updated calldata batch. |

## Manual calldata reference
- Use Phase8 manager `forwardPauseCall(target, data)` when invoking pause actions from the emergency console.
- For domain isolation protocols, compute `bytes32 domainId = keccak256(abi.encodePacked(slug))` using the slug shown above.
- For capital stream freezes, execute the generated calldata to toggle stream activity, then apply updated stream bindings.

## Post-incident checklist
- Archive incident summary, tx hashes, and updated telemetry in governance records.
- Rerun `npm run demo:phase8:orchestrate` to regenerate directives reflecting new parameters.
- Validate sentinel coverage and capital funding remain ≥ guardian review window before resuming full autonomy.
