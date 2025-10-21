# Owner Diagnostics (Static Verification)

Readiness: ready

Coverage readiness: ready (5/5 controls satisfied)

| Capability | Command | Verification | Status |
| --- | --- | --- | --- |
| Circuit breaker engage | `npm run owner:system-pause -- --action pause` (✅) | `npm run owner:system-pause -- --action status` (✅) | Ready |
| Recalibrate reward engine temperature | `npm run thermostat:update -- --mission demo/Meta-Agentic-Program-Synthesis-v0/config/mission.meta-agentic-program-synthesis.json` (✅) | `npm run thermodynamics:report` (✅) | Ready |
| Queue sovereign upgrade | `npm run owner:upgrade -- --mission demo/Meta-Agentic-Program-Synthesis-v0/config/mission.meta-agentic-program-synthesis.json` (✅) | `npm run owner:upgrade-status` (✅) | Ready |
| Mirror treasury share | `npm run reward-engine:update -- --mission demo/Meta-Agentic-Program-Synthesis-v0/config/mission.meta-agentic-program-synthesis.json` (✅) | `npm run reward-engine:report` (✅) | Ready |
| Refresh compliance dossier | `npm run owner:compliance-report` (✅) | `npm run owner:doctor` (✅) | Ready |
