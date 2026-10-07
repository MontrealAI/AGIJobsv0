# AGI Jobs demo guide

Start with a local workflow below, inspect its output, then explore the complete catalog. Existing demonstrations, research scenarios, and flowcharts are retained.

## Choose a first run

Run commands from the repository root after the [pinned setup](../docs/START_HERE.md#reproduce-the-local-baseline). Node commands use Node 22.23.3 and npm 10.8.2; Python demos use a Python 3.12 virtual environment and their own requirements files.

| Goal | Command / guide | Evidence to inspect |
| --- | --- | --- |
| Complete one job on a disposable blockchain | `npm run demo:aurora:local` · [AURORA](aurora/README.md#run-the-local-job-lifecycle) | `reports/localhost/aurora/`: transactions, validator votes, and settlement |
| Complete three sector scenarios | `npm run demo:asi-takeoff:local` · [ASI Take-Off](asi-takeoff/README.md#retained-local-contract-walkthrough) | `reports/localhost/asi-takeoff/`: three finalized jobs and payouts |
| Rehearse global coordination | `npm run demo:asi-global:local` · [ASI Global](asi-global/README.md) | `reports/localhost/asi-global/`: three actual local settlements |
| Rehearse energy, food, health, and macroeconomic scenarios | `npm run demo:atlas-conductor:local` · [Atlas Conductor](atlas-conductor/README.md) | `reports/localhost/atlas-conductor/`: four actual local settlements |
| Explore recursive-model simulation without a wallet | [Tiny Recursive Model setup](Tiny-Recursive-Model-v0/README.md#run-the-headless-demo) | Synthetic outcomes and model telemetry; install its headless Python requirements |
| Explore graph indexing, the arena, and its UI | [CULTURE local fixture stack](CULTURE-v0/README.md) | Local chain events, persistent indexer state, authenticated API and UI checks |
| Rehearse production controls together | `npm run production:rehearse` · [Rehearsal guide](../docs/production/rehearsal.md) | An isolated eleven-stage report, retained logs and verifiable simulation evidence |

The local blockchain launchers bind to `127.0.0.1`, require chain ID 31337, and stop only the node they started. They require no paid wallet or provider credentials. Use a separate shell with conflicting RPC/chain overrides removed. If port 8545 is occupied, choose another port, for example:

```bash
DEMO_PORT=18545 npm run demo:asi-global:local
```

The first compilation can take several minutes. Keep the terminal open until the report is printed. The node stops at completion; receipts remain for inspection. Repeating a mission reuses its default report namespace. To preserve a particular run, set a distinct `AURORA_REPORT_SCOPE`, for example `asi-global-review-01`, before starting ASI Take-Off, ASI Global, or Atlas Conductor.

## Understand the result

- **Local settlement:** real contract execution and transaction receipts on a disposable chain, using mock tokens, local identities, and synthetic work.
- **Deterministic simulation:** a model or replay under explicit assumptions. Projected economic results are not measured earnings or live throughput.
- **Provider/UI fixtures:** exercise integration behavior with test responses. Read the corresponding guide before connecting a real provider.
- **Design guide:** preserves architecture, mission narratives, and flowcharts; that directory does not contain a standalone executable.
- **Supporting code / assets:** shared packages, import-compatible aliases, tests, or presentation material. Open the referenced directory to find its parent workflow.

A demo succeeds only within its stated scope. Local tokens, fixture receipts, and economic projections do not establish independent review, live provider quality, public-network commissioning, or delivery of the real-world projects named in a scenario. [Production readiness](../docs/production/readiness-2026-10-03.md) records the remaining requirements.

## Find any demo

```bash
npm run demos
npm run demos -- --search governance
npm run demos -- --json
```

The catalog reads tracked files and registered root npm scripts. It lists commands without executing them. A Git checkout is required for the CLI; the table below works directly on GitHub.

## Validate a demo

Run its documented tests first. Python suites are isolated from one another to avoid colliding package names:

```bash
python demo/run_demo_tests.py --list --runner python
python demo/run_demo_tests.py --demo asi-global --runner python --timeout 180
python demo/run_demo_tests.py --runner python --timeout 180
```

Install the relevant demo's dependencies in the active virtual environment. The complete Python selection includes PyTorch demos; missing dependencies fail visibly. `--runner` can be repeated for `python`, `npm`, `pnpm`, `yarn`, and `forge`. Omitting it preserves the existing all-runtime runner. A selected test result covers that selection only; Node/browser, Foundry, and local-settlement checks remain separate.

| Symptom | Next step |
| --- | --- |
| Port is occupied | Choose another `DEMO_PORT`; do not stop unrelated processes. |
| RPC or chain validation fails | Remove conflicting `RPC_URL`, `LOCALHOST_RPC_URL`, `AGI_RPC_URL`, or `CHAIN_ID` settings from this shell. |
| Python module is missing | Install that demo's requirements into the active virtual environment, then use `python -m pip check`. |
| Compilation fails or times out | Check the pinned Node/npm versions, free disk and memory, and the first error in the compilation log. |
| Receipts contain placeholder markers or zero transaction hashes | They are fixture output, not settlement evidence. Use the local launcher and inspect `receipts/jobs/<slug>/finalize.json`. |
| An owner/RPC command fails after a local demo finishes | The disposable node has stopped. Use retained receipts, or follow the advanced runbook against a separately managed test deployment. |

## Complete catalog

The generated section includes every tracked top-level directory and every nested README/runbook variant. After adding or moving demos, run `npm run demos -- --write`; `npm run demos -- --check` enforces the inventory in CI.

<!-- demo-catalog:start -->

76 tracked demo directories; labels describe repository contents, not production readiness. Commands are discovery links: read each guide before execution, especially owner, network, and provider commands. Search all registered commands with `npm run demos -- --search <text>`.

| Demo or supporting directory | Contents | Registered commands (selection) |
| --- | --- | --- |
| [Absolute-Zero-Reasoner-v0](Absolute-Zero-Reasoner-v0/README.md) | Code and guide | Open the guide or source directory |
| [AGI-Alpha-Node-v0](AGI-Alpha-Node-v0/README.md) | Code and guide | `demo:agi-alpha-node`, `demo:agi-alpha-node:prod` |
| [agi-governance](agi-governance/README.md) | Code and guide | `demo:agi-governance`, `demo:agi-governance:alpha-v13`, `demo:agi-governance:alpha-v13:full` |
| [AGI-Jobs-Platform-at-Kardashev-II-Scale](AGI-Jobs-Platform-at-Kardashev-II-Scale/README.md) | Code and guide | `demo:kardashev`, `demo:kardashev-ii:serve`, `demo:kardashev-ii-lattice:orchestrate` |
| [agi-labor-market-grand-demo](agi-labor-market-grand-demo/README.md) | Code and guide | `demo:agi-labor-market:export` |
| [AGIJobs-Day-One-Utility-Benchmark](AGIJobs-Day-One-Utility-Benchmark/README.md) | Code and guide | Open the guide or source directory |
| [alpha-agi-insight-mark](alpha-agi-insight-mark/README.md) | Code and guide | `demo:alpha-agi-insight-mark` |
| [alpha-agi-mark](alpha-agi-mark/README.md) | Code and guide | `demo:alpha-agi-mark`, `demo:alpha-agi-mark:full` |
| [alpha-meta](alpha-meta/README.md) | Code and guide | `demo:alpha-meta`, `demo:alpha-meta:full`, `demo:alpha-meta:owner` |
| [AlphaEvolve_v0](AlphaEvolve_v0) | Supporting code / assets | Open the guide or source directory |
| [AlphaEvolve-v0](AlphaEvolve-v0/README.md) | Code and guide | Open the guide or source directory |
| [asi-global](asi-global/README.md) | Code and guide | `demo:asi-global:local` |
| [asi-takeoff](asi-takeoff/README.md) | Code and guide | `demo:asi-takeoff:local`, `demo:asi-takeoff:studio`, `demo:asi-takeoff:plan` |
| [astral_omnidominion_operating_system](astral_omnidominion_operating_system) | Supporting code / assets | Open the guide or source directory |
| [astral-citadel](astral-citadel/README.md) | Code and guide | Open the guide or source directory |
| [astral-omnidominion-operating-system](astral-omnidominion-operating-system/README.md) | Code and guide | Open the guide or source directory |
| [astral-omnidominion-operating-system-command-theatre](astral-omnidominion-operating-system-command-theatre/README.md) | Code and guide | Open the guide or source directory |
| [atlas-conductor](atlas-conductor/README.md) | Code and guide | `demo:atlas-conductor:local` |
| [aurora](aurora/README.md) | Code and guide | `demo:asi-takeoff:report`, `demo:aurora:local`, `demo:aurora:report` |
| [CELESTIAL-SOVEREIGN-ORBITAL-AGI-OS-GRAND-DEMONSTRATION](CELESTIAL-SOVEREIGN-ORBITAL-AGI-OS-GRAND-DEMONSTRATION/README.md) | Design guide | Open the guide or source directory |
| [cosmic-omni-sovereign-symphony](cosmic-omni-sovereign-symphony/README.md) | Code and guide | `demo:flagship` |
| [cosmic-omniversal-grand-symphony](cosmic-omniversal-grand-symphony/README.md) | Code and guide | Open the guide or source directory |
| [CULTURE-v0](CULTURE-v0/README.md) | Code and guide | Open the guide or source directory |
| [Economic-Power-v0](Economic-Power-v0/README.md) | Code and guide | `demo:economic-power` |
| [Era-Of-Experience-v0](Era-Of-Experience-v0/README.md) | Code and guide | `demo:era-of-experience`, `demo:era-of-experience:audit`, `demo:era-of-experience:verify` |
| [helios-omniversal-symphony](helios-omniversal-symphony/README.md) | Code and guide | Open the guide or source directory |
| [huxley_godel_machine_v0](huxley_godel_machine_v0) | Supporting code / assets | Open the guide or source directory |
| [Huxley-Godel-Machine-v0](Huxley-Godel-Machine-v0/README.md) | Code and guide | `demo:hgm:qa`, `demo:hgm:worker` |
| [ICONIC-OPERATING-SYSTEM-DEMO](ICONIC-OPERATING-SYSTEM-DEMO/README.md) | Design guide | Open the guide or source directory |
| [imperatrix-celestia-operating-system](imperatrix-celestia-operating-system/README.md) | Code and guide | Open the guide or source directory |
| [infinity-symphony](infinity-symphony/README.md) | Code and guide | Open the guide or source directory |
| [kardashev_ii_omega_grade_alpha_agi_business_3](kardashev_ii_omega_grade_alpha_agi_business_3/README.md) | Code and guide | `demo:kardashev-business:serve`, `demo:kardashev-business:plan`, `demo:kardashev-business:worker` |
| [kardashev_ii_omega_grade_alpha_agi_business_3_demo](kardashev_ii_omega_grade_alpha_agi_business_3_demo/README.md) | Code and guide | Open the guide or source directory |
| [kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega](kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega/README.md) | Code and guide | Open the guide or source directory |
| [kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme](kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme/README.md) | Code and guide | Open the guide or source directory |
| [kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra](kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra/README.md) | Code and guide | Open the guide or source directory |
| [Kardashev-II Omega-Grade-α-AGI Business-3](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/README.md) | Code and guide | `demo:kardashev-ii-omega-upgrade`, `demo:kardashev-ii-omega-upgrade-v3`, `demo:kardashev-ii-omega-ultra` |
| [Kardashev-II-Omega-Grade-Alpha-AGI-Business-3](Kardashev-II-Omega-Grade-Alpha-AGI-Business-3/README.md) | Code and guide | Open the guide or source directory |
| [LARGE-SCALE-OMEGA-BUSINESS-3](LARGE-SCALE-OMEGA-BUSINESS-3/README.md) | Code and guide | `demo:omega-business-3`, `demo:omega-business-3:ui` |
| [meta-agentic-alpha-agi](meta-agentic-alpha-agi/README.md) | Code and guide | Open the guide or source directory |
| [Meta-Agentic-ALPHA-AGI-Jobs-v0](Meta-Agentic-ALPHA-AGI-Jobs-v0/README.md) | Code and guide | `demo:meta-agentic-alpha`, `demo:meta-agentic-alpha:work`, `demo:meta-agentic-alpha:serve` |
| [Meta-Agentic-Program-Synthesis-v0](Meta-Agentic-Program-Synthesis-v0/README.md) | Code and guide | `demo:meta-agentic-program-synthesis`, `demo:meta-agentic-program-synthesis:briefing`, `demo:meta-agentic-program-synthesis:full` |
| [MuZero-style-v0](MuZero-style-v0/README.md) | Code and guide | Open the guide or source directory |
| [National-Supply-Chain-v0](National-Supply-Chain-v0/README.md) | Code and guide | `demo:national-supply-chain:export` |
| [OMNI-CONCORD-ASCENSION-ATLAS](OMNI-CONCORD-ASCENSION-ATLAS/README.md) | Design guide | Open the guide or source directory |
| [omni-orchestrator-singularity](omni-orchestrator-singularity/README.md) | Code and guide | Open the guide or source directory |
| [omni-sovereign-ascension-operating-system](omni-sovereign-ascension-operating-system/README.md) | Code and guide | `demo:omni-sovereign` |
| [OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY](OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/README.md) | Code and guide | Open the guide or source directory |
| [OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE](OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/README.md) | Code and guide | Open the guide or source directory |
| [omnisovereign](omnisovereign/README.md) | Code and guide | `demo:omnisovereign`, `demo:omnisovereign:serve`, `demo:omnisovereign:task` |
| [One-Box](One-Box/README.md) | Code and guide | `demo:onebox:doctor`, `demo:onebox:launch`, `demo:computer-work` |
| [open_endedness_v0](open_endedness_v0) | Supporting code / assets | Open the guide or source directory |
| [Open-Endedness-v0](Open-Endedness-v0/README.md) | Code and guide | Open the guide or source directory |
| [Phase-6-Scaling-Multi-Domain-Expansion](Phase-6-Scaling-Multi-Domain-Expansion/README.md) | Code and guide | `demo:phase6:did`, `demo:phase6:iot`, `demo:phase6:orchestrate` |
| [Phase-8-Universal-Value-Dominance](Phase-8-Universal-Value-Dominance/README.md) | Code and guide | `demo:phase8:bootstrap`, `demo:phase8:orchestrate`, `demo:phase8:work` |
| [Planetary-Orchestrator-Fabric-v0](Planetary-Orchestrator-Fabric-v0/README.md) | Code and guide | `demo:planetary-orchestrator-fabric`, `demo:planetary-orchestrator-fabric:restart`, `demo:planetary-orchestrator-fabric:acceptance` |
| [polaris-concordat](polaris-concordat/README.md) | Design guide | Open the guide or source directory |
| [presentation](presentation) | Supporting code / assets | Open the guide or source directory |
| [REDENOMINATION](REDENOMINATION/README.md) | Code and guide | `demo:redenomination`, `demo:redenomination:control-room`, `demo:redenomination:export` |
| [solving-alpha-agi-governance](solving-alpha-agi-governance/README.md) | Design guide | Open the guide or source directory |
| [sovereign-constellation](sovereign-constellation/README.md) | Code and guide | `demo:sovereign-constellation`, `demo:sovereign-constellation:asi-takes-off`, `demo:sovereign-constellation:asi-takes-off:flight-plan` |
| [sovereign-mesh](sovereign-mesh/README.md) | Code and guide | Open the guide or source directory |
| [superintelligent-empowerment](superintelligent-empowerment/docs/README.md) | Code and guide | Open the guide or source directory |
| [tests](tests) | Supporting code / assets | Open the guide or source directory |
| [Tiny-Recursive-Model-v0](Tiny-Recursive-Model-v0/README.md) | Code and guide | Open the guide or source directory |
| [TRIDENT-SOVEREIGN-AGI-ORCHESTRATOR](TRIDENT-SOVEREIGN-AGI-ORCHESTRATOR/README.md) | Code and guide | `demo:trident-sovereign`, `demo:trident-sovereign:ui` |
| [Trustless-Economic-Core-v0](Trustless-Economic-Core-v0/README.md) | Code and guide | Open the guide or source directory |
| [validator_constellation_v0](validator_constellation_v0) | Supporting code / assets | Open the guide or source directory |
| [Validator-Constellation-v0](Validator-Constellation-v0/README.md) | Code and guide | `demo:validator-constellation`, `demo:validator-constellation:scenario`, `demo:validator-constellation:operator-console` |
| [zenith-sapience](zenith-sapience/README.md) | Design guide | Open the guide or source directory |
| [zenith-sapience-initiative-celestial-archon-governance](zenith-sapience-initiative-celestial-archon-governance/README.md) | Code and guide | `demo:zenith-sapience-celestial-archon`, `demo:zenith-sapience-celestial-archon:local` |
| [zenith-sapience-initiative-global-governance](zenith-sapience-initiative-global-governance/README.md) | Code and guide | `demo:zenith-sapience-initiative`, `demo:zenith-sapience-initiative:local` |
| [zenith-sapience-initiative-omega-omni-operating-system](zenith-sapience-initiative-omega-omni-operating-system/README.md) | Design guide | Open the guide or source directory |
| [zenith-sapience-initiative-omnidominion-governance](zenith-sapience-initiative-omnidominion-governance/README.md) | Code and guide | `demo:zenith-sapience-omnidominion`, `demo:zenith-sapience-omnidominion:local` |
| [zenith-sapience-initiative-planetary-operating-system-governance](zenith-sapience-initiative-planetary-operating-system-governance/README.md) | Code and guide | `demo:zenith-sapience-planetary-os`, `demo:zenith-sapience-planetary-os:local` |
| [zenith-sapience-initiative-supra-sovereign-hypernova-governance](zenith-sapience-initiative-supra-sovereign-hypernova-governance/README.md) | Code and guide | `demo:zenith-hypernova`, `demo:zenith-hypernova:local`, `demo:zenith-hypernova:work` |

### Nested guides and variants

- [AGI-Alpha-Node-v0/grand_demo/README.md](AGI-Alpha-Node-v0/grand_demo/README.md)
- [AGI-Alpha-Node-v0/grandiose_alpha_demo/README.md](AGI-Alpha-Node-v0/grandiose_alpha_demo/README.md)
- [AGI-Jobs-Platform-at-Kardashev-II-Scale/k2-stellar-demo/README.md](AGI-Jobs-Platform-at-Kardashev-II-Scale/k2-stellar-demo/README.md)
- [AGI-Jobs-Platform-at-Kardashev-II-Scale/k2-stellar-demo/output/README.md](AGI-Jobs-Platform-at-Kardashev-II-Scale/k2-stellar-demo/output/README.md)
- [AGI-Jobs-Platform-at-Kardashev-II-Scale/output/README.md](AGI-Jobs-Platform-at-Kardashev-II-Scale/output/README.md)
- [AGI-Jobs-Platform-at-Kardashev-II-Scale/output/governance-playbook.md](AGI-Jobs-Platform-at-Kardashev-II-Scale/output/governance-playbook.md)
- [AGI-Jobs-Platform-at-Kardashev-II-Scale/stellar-civilization-lattice/README.md](AGI-Jobs-Platform-at-Kardashev-II-Scale/stellar-civilization-lattice/README.md)
- [AGI-Jobs-Platform-at-Kardashev-II-Scale/stellar-civilization-lattice/output/README.md](AGI-Jobs-Platform-at-Kardashev-II-Scale/stellar-civilization-lattice/output/README.md)
- [CULTURE-v0/apps/culture-studio/README.md](CULTURE-v0/apps/culture-studio/README.md)
- [CULTURE-v0/backend/arena-orchestrator/README.md](CULTURE-v0/backend/arena-orchestrator/README.md)
- [CULTURE-v0/ci/README.md](CULTURE-v0/ci/README.md)
- [CULTURE-v0/contracts/README.md](CULTURE-v0/contracts/README.md)
- [CULTURE-v0/indexers/culture-graph-indexer/README.md](CULTURE-v0/indexers/culture-graph-indexer/README.md)
- [CULTURE-v0/reports/README.md](CULTURE-v0/reports/README.md)
- [CULTURE-v0/scripts/README.md](CULTURE-v0/scripts/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2_omega_upgrade/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2_omega_upgrade/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2_omega_upgrade/storage/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2_omega_upgrade/storage/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v2/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v2/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v3/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v3/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v4/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v4/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v5/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v5/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v6/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v6/README.md)
- [Kardashev-II Omega-Grade-α-AGI Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v7/README.md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v7/README.md)
- [LARGE-SCALE-OMEGA-BUSINESS-3/computer-work/README.md](LARGE-SCALE-OMEGA-BUSINESS-3/computer-work/README.md)
- [LARGE-SCALE-OMEGA-BUSINESS-3/ui/operator-playbook.md](LARGE-SCALE-OMEGA-BUSINESS-3/ui/operator-playbook.md)
- [Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_prime_demo/README.md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_prime_demo/README.md)
- [Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v10/README.md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v10/README.md)
- [Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v11/README.md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v11/README.md)
- [Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v2/README.md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v2/README.md)
- [Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v3/README.md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v3/README.md)
- [Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v4/README.md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v4/README.md)
- [Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v5/README.md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v5/README.md)
- [Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v6/README.md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v6/README.md)
- [Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v7/README.md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v7/README.md)
- [Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v8/README.md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v8/README.md)
- [Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v9/README.md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v9/README.md)
- [Meta-Agentic-ALPHA-AGI-Jobs-v0/reports/owner-playbook.md](Meta-Agentic-ALPHA-AGI-Jobs-v0/reports/owner-playbook.md)
- [One-Box/computer-work/README.md](One-Box/computer-work/README.md)
- [Phase-8-Universal-Value-Dominance/output/phase8-guardian-response-playbook.md](Phase-8-Universal-Value-Dominance/output/phase8-guardian-response-playbook.md)
- [TRIDENT-SOVEREIGN-AGI-ORCHESTRATOR/ui/operator-playbook.md](TRIDENT-SOVEREIGN-AGI-ORCHESTRATOR/ui/operator-playbook.md)
- [Validator-Constellation-v0/v2/README.md](Validator-Constellation-v0/v2/README.md)
- [agi-governance/alpha-v13/README.md](agi-governance/alpha-v13/README.md)
- [agi-governance/alpha-v13/RUNBOOK.md](agi-governance/alpha-v13/RUNBOOK.md)
- [agi-governance/alpha-v14/README.md](agi-governance/alpha-v14/README.md)
- [agi-governance/alpha-v14/RUNBOOK.md](agi-governance/alpha-v14/RUNBOOK.md)
- [agi-governance/alpha-v15/README.md](agi-governance/alpha-v15/README.md)
- [agi-governance/alpha-v15/RUNBOOK.md](agi-governance/alpha-v15/RUNBOOK.md)
- [agi-governance/alpha-v16/README.md](agi-governance/alpha-v16/README.md)
- [agi-governance/alpha-v16/RUNBOOK.md](agi-governance/alpha-v16/RUNBOOK.md)
- [agi-governance/alpha-v17/README.md](agi-governance/alpha-v17/README.md)
- [agi-governance/alpha-v17/RUNBOOK.md](agi-governance/alpha-v17/RUNBOOK.md)
- [alpha-agi-insight-mark/runbooks/operator-runbook.md](alpha-agi-insight-mark/runbooks/operator-runbook.md)
- [alpha-agi-mark/runbooks/alpha-agi-mark-runbook.md](alpha-agi-mark/runbooks/alpha-agi-mark-runbook.md)
- [cosmic-omni-sovereign-symphony/docs/RUNBOOK.md](cosmic-omni-sovereign-symphony/docs/RUNBOOK.md)
- [cosmic-omni-sovereign-symphony/docs/flagship-runbook.md](cosmic-omni-sovereign-symphony/docs/flagship-runbook.md)
- [cosmic-omni-sovereign-symphony/docs/observability-playbook.md](cosmic-omni-sovereign-symphony/docs/observability-playbook.md)
- [kardashev_ii_omega_grade_alpha_agi_business_3/workbench/README.md](kardashev_ii_omega_grade_alpha_agi_business_3/workbench/README.md)
- [sovereign-constellation/asi-takes-off-demo/README.md](sovereign-constellation/asi-takes-off-demo/README.md)
- [superintelligent-empowerment/docs/README.md](superintelligent-empowerment/docs/README.md)

<!-- demo-catalog:end -->
