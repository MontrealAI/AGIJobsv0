# ASI Take-Off Demonstration Summary

- **Initiative:** National High-Speed Rail Corridor
- **Objective:** Deploy an end-to-end rail corridor between City A and City B within 12 months using AGI Jobs automation primitives.
- **Budget:** 500000 AGIALPHA
- **Dry-Run Status:** pass
- **Dry-Run Timestamp:** 2025-10-13T18:06:12.522Z
- **Scenario Successes:** 2/2
- **Defined Jobs:** 5

## Scenario Breakdown

### Job lifecycle rehearsal (local harness) (job-lifecycle)
- Status: pass
  - Agent received 1099.0 AGIALPHA after finalization
  - Job lifecycle rehearsal succeeded without errors.

### SystemPause control rehearsal (system-pause)
- Status: pass
  - SystemPause deployed at 0xF0cd6240A2777D2bEB753C95F69F09cdb8421e87
  - StakeManager minStake now 2.0 AGIALPHA
  - SystemPause rehearsal completed successfully.

## Planned High-Speed Rail Jobs

- **SURVEY-AB** – Route intelligence and geospatial survey
- Reward: 85000 AGIALPHA
  - Deadline: 30 days
  - Dependencies: None
  - Thermodynamic response: raise-temperature
- **DESIGN-CORE** – Rail systems architecture and phasing
- Reward: 95000 AGIALPHA
  - Deadline: 60 days
  - Dependencies: SURVEY-AB
  - Thermodynamic response: increase-agent-share
- **CONSTRUCT-NORTH** – High-speed corridor construction – northern section
- Reward: 130000 AGIALPHA
  - Deadline: 180 days
  - Dependencies: DESIGN-CORE
  - Thermodynamic response: double-validator-bonus
- **CONSTRUCT-SOUTH** – High-speed corridor construction – southern section
- Reward: 130000 AGIALPHA
  - Deadline: 180 days
  - Dependencies: DESIGN-CORE
  - Thermodynamic response: raise-temperature
- **VALIDATE-SYSTEM** – Integrated validation, safety, and energy efficiency audit
- Reward: 60000 AGIALPHA
  - Deadline: 30 days
  - Dependencies: CONSTRUCT-NORTH, CONSTRUCT-SOUTH
  - Thermodynamic response: trigger-pause-check

## Artifact Index

- Dry-run report: reports/asi-takeoff/dry-run.json
- Thermodynamics snapshot: reports/asi-takeoff/thermodynamics.json
- Mission control dossier: reports/asi-takeoff/mission-control.md
- Bundle directory: reports/asi-takeoff/mission-bundle
