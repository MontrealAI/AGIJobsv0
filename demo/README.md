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
| [Absolute&#45;Zero&#45;Reasoner&#45;v0](Absolute-Zero-Reasoner-v0/README.md) | Code and guide | Open the guide or source directory |
| [AGI&#45;Alpha&#45;Node&#45;v0](AGI-Alpha-Node-v0/README.md) | Code and guide | demo&#58;agi&#45;alpha&#45;node, demo&#58;agi&#45;alpha&#45;node&#58;prod |
| [agi&#45;governance](agi-governance/README.md) | Code and guide | demo&#58;agi&#45;governance, demo&#58;agi&#45;governance&#58;alpha&#45;v13, demo&#58;agi&#45;governance&#58;alpha&#45;v13&#58;full |
| [AGI&#45;Jobs&#45;Platform&#45;at&#45;Kardashev&#45;II&#45;Scale](AGI-Jobs-Platform-at-Kardashev-II-Scale/README.md) | Code and guide | demo&#58;kardashev, demo&#58;kardashev&#45;ii&#58;serve, demo&#58;kardashev&#45;ii&#45;lattice&#58;orchestrate |
| [agi&#45;labor&#45;market&#45;grand&#45;demo](agi-labor-market-grand-demo/README.md) | Code and guide | demo&#58;agi&#45;labor&#45;market&#58;export |
| [AGIJobs&#45;Day&#45;One&#45;Utility&#45;Benchmark](AGIJobs-Day-One-Utility-Benchmark/README.md) | Code and guide | Open the guide or source directory |
| [alpha&#45;agi&#45;insight&#45;mark](alpha-agi-insight-mark/README.md) | Code and guide | demo&#58;alpha&#45;agi&#45;insight&#45;mark |
| [alpha&#45;agi&#45;mark](alpha-agi-mark/README.md) | Code and guide | demo&#58;alpha&#45;agi&#45;mark, demo&#58;alpha&#45;agi&#45;mark&#58;full |
| [alpha&#45;meta](alpha-meta/README.md) | Code and guide | demo&#58;alpha&#45;meta, demo&#58;alpha&#45;meta&#58;full, demo&#58;alpha&#45;meta&#58;owner |
| [AlphaEvolve&#95;v0](AlphaEvolve_v0) | Supporting code / assets | Open the guide or source directory |
| [AlphaEvolve&#45;v0](AlphaEvolve-v0/README.md) | Code and guide | Open the guide or source directory |
| [asi&#45;global](asi-global/README.md) | Code and guide | demo&#58;asi&#45;global&#58;local |
| [asi&#45;takeoff](asi-takeoff/README.md) | Code and guide | demo&#58;asi&#45;takeoff&#58;local, demo&#58;asi&#45;takeoff&#58;studio, demo&#58;asi&#45;takeoff&#58;plan |
| [astral&#95;omnidominion&#95;operating&#95;system](astral_omnidominion_operating_system) | Supporting code / assets | Open the guide or source directory |
| [astral&#45;citadel](astral-citadel/README.md) | Code and guide | Open the guide or source directory |
| [astral&#45;omnidominion&#45;operating&#45;system](astral-omnidominion-operating-system/README.md) | Code and guide | Open the guide or source directory |
| [astral&#45;omnidominion&#45;operating&#45;system&#45;command&#45;theatre](astral-omnidominion-operating-system-command-theatre/README.md) | Code and guide | Open the guide or source directory |
| [atlas&#45;conductor](atlas-conductor/README.md) | Code and guide | demo&#58;atlas&#45;conductor&#58;local |
| [aurora](aurora/README.md) | Code and guide | demo&#58;asi&#45;takeoff&#58;report, demo&#58;aurora&#58;local, demo&#58;aurora&#58;report |
| [CELESTIAL&#45;SOVEREIGN&#45;ORBITAL&#45;AGI&#45;OS&#45;GRAND&#45;DEMONSTRATION](CELESTIAL-SOVEREIGN-ORBITAL-AGI-OS-GRAND-DEMONSTRATION/README.md) | Code and guide | Open the guide or source directory |
| [cosmic&#45;omni&#45;sovereign&#45;symphony](cosmic-omni-sovereign-symphony/README.md) | Code and guide | demo&#58;flagship |
| [cosmic&#45;omniversal&#45;grand&#45;symphony](cosmic-omniversal-grand-symphony/README.md) | Code and guide | Open the guide or source directory |
| [CULTURE&#45;v0](CULTURE-v0/README.md) | Code and guide | Open the guide or source directory |
| [Economic&#45;Power&#45;v0](Economic-Power-v0/README.md) | Code and guide | demo&#58;economic&#45;power |
| [Era&#45;Of&#45;Experience&#45;v0](Era-Of-Experience-v0/README.md) | Code and guide | demo&#58;era&#45;of&#45;experience, demo&#58;era&#45;of&#45;experience&#58;audit, demo&#58;era&#45;of&#45;experience&#58;verify |
| [helios&#45;omniversal&#45;symphony](helios-omniversal-symphony/README.md) | Code and guide | Open the guide or source directory |
| [huxley&#95;godel&#95;machine&#95;v0](huxley_godel_machine_v0) | Supporting code / assets | Open the guide or source directory |
| [Huxley&#45;Godel&#45;Machine&#45;v0](Huxley-Godel-Machine-v0/README.md) | Code and guide | demo&#58;hgm&#58;qa, demo&#58;hgm&#58;worker |
| [ICONIC&#45;OPERATING&#45;SYSTEM&#45;DEMO](ICONIC-OPERATING-SYSTEM-DEMO/README.md) | Code and guide | Open the guide or source directory |
| [imperatrix&#45;celestia&#45;operating&#45;system](imperatrix-celestia-operating-system/README.md) | Code and guide | Open the guide or source directory |
| [infinity&#45;symphony](infinity-symphony/README.md) | Code and guide | Open the guide or source directory |
| [kardashev&#95;ii&#95;omega&#95;grade&#95;alpha&#95;agi&#95;business&#95;3](kardashev_ii_omega_grade_alpha_agi_business_3/README.md) | Code and guide | demo&#58;kardashev&#45;business&#58;serve, demo&#58;kardashev&#45;business&#58;plan, demo&#58;kardashev&#45;business&#58;worker |
| [kardashev&#95;ii&#95;omega&#95;grade&#95;alpha&#95;agi&#95;business&#95;3&#95;demo](kardashev_ii_omega_grade_alpha_agi_business_3_demo/README.md) | Code and guide | Open the guide or source directory |
| [kardashev&#95;ii&#95;omega&#95;grade&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;omega](kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega/README.md) | Code and guide | Open the guide or source directory |
| [kardashev&#95;ii&#95;omega&#95;grade&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;supreme](kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme/README.md) | Code and guide | Open the guide or source directory |
| [kardashev&#95;ii&#95;omega&#95;grade&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;ultra](kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra/README.md) | Code and guide | Open the guide or source directory |
| [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/README.md) | Code and guide | demo&#58;kardashev&#45;ii&#45;omega&#45;upgrade, demo&#58;kardashev&#45;ii&#45;omega&#45;upgrade&#45;v3, demo&#58;kardashev&#45;ii&#45;omega&#45;ultra |
| [Kardashev&#45;II&#45;Omega&#45;Grade&#45;Alpha&#45;AGI&#45;Business&#45;3](Kardashev-II-Omega-Grade-Alpha-AGI-Business-3/README.md) | Code and guide | Open the guide or source directory |
| [LARGE&#45;SCALE&#45;OMEGA&#45;BUSINESS&#45;3](LARGE-SCALE-OMEGA-BUSINESS-3/README.md) | Code and guide | demo&#58;omega&#45;business&#45;3, demo&#58;omega&#45;business&#45;3&#58;ui |
| [meta&#45;agentic&#45;alpha&#45;agi](meta-agentic-alpha-agi/README.md) | Code and guide | Open the guide or source directory |
| [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0](Meta-Agentic-ALPHA-AGI-Jobs-v0/README.md) | Code and guide | demo&#58;meta&#45;agentic&#45;alpha, demo&#58;meta&#45;agentic&#45;alpha&#58;work, demo&#58;meta&#45;agentic&#45;alpha&#58;serve |
| [Meta&#45;Agentic&#45;Program&#45;Synthesis&#45;v0](Meta-Agentic-Program-Synthesis-v0/README.md) | Code and guide | demo&#58;meta&#45;agentic&#45;program&#45;synthesis, demo&#58;meta&#45;agentic&#45;program&#45;synthesis&#58;briefing, demo&#58;meta&#45;agentic&#45;program&#45;synthesis&#58;full |
| [MuZero&#45;style&#45;v0](MuZero-style-v0/README.md) | Code and guide | Open the guide or source directory |
| [National&#45;Supply&#45;Chain&#45;v0](National-Supply-Chain-v0/README.md) | Code and guide | demo&#58;national&#45;supply&#45;chain&#58;export |
| [OMNI&#45;CONCORD&#45;ASCENSION&#45;ATLAS](OMNI-CONCORD-ASCENSION-ATLAS/README.md) | Code and guide | Open the guide or source directory |
| [omni&#45;orchestrator&#45;singularity](omni-orchestrator-singularity/README.md) | Code and guide | Open the guide or source directory |
| [omni&#45;sovereign&#45;ascension&#45;operating&#45;system](omni-sovereign-ascension-operating-system/README.md) | Code and guide | demo&#58;omni&#45;sovereign |
| [OMNIGENESIS&#45;GLOBAL&#45;SOVEREIGN&#45;SYMPHONY](OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/README.md) | Code and guide | Open the guide or source directory |
| [OMNIPHOENIX&#45;ASCENDANT&#45;HYPERSTRUCTURE](OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/README.md) | Code and guide | Open the guide or source directory |
| [omnisovereign](omnisovereign/README.md) | Code and guide | demo&#58;omnisovereign, demo&#58;omnisovereign&#58;serve, demo&#58;omnisovereign&#58;task |
| [One&#45;Box](One-Box/README.md) | Code and guide | demo&#58;onebox&#58;doctor, demo&#58;onebox&#58;launch, demo&#58;computer&#45;work |
| [open&#95;endedness&#95;v0](open_endedness_v0) | Supporting code / assets | Open the guide or source directory |
| [Open&#45;Endedness&#45;v0](Open-Endedness-v0/README.md) | Code and guide | Open the guide or source directory |
| [Phase&#45;6&#45;Scaling&#45;Multi&#45;Domain&#45;Expansion](Phase-6-Scaling-Multi-Domain-Expansion/README.md) | Code and guide | demo&#58;phase6&#58;did, demo&#58;phase6&#58;iot, demo&#58;phase6&#58;orchestrate |
| [Phase&#45;8&#45;Universal&#45;Value&#45;Dominance](Phase-8-Universal-Value-Dominance/README.md) | Code and guide | demo&#58;phase8&#58;bootstrap, demo&#58;phase8&#58;orchestrate, demo&#58;phase8&#58;work |
| [Planetary&#45;Orchestrator&#45;Fabric&#45;v0](Planetary-Orchestrator-Fabric-v0/README.md) | Code and guide | demo&#58;planetary&#45;orchestrator&#45;fabric, demo&#58;planetary&#45;orchestrator&#45;fabric&#58;restart, demo&#58;planetary&#45;orchestrator&#45;fabric&#58;acceptance |
| [polaris&#45;concordat](polaris-concordat/README.md) | Code and guide | Open the guide or source directory |
| [presentation](presentation) | Supporting code / assets | Open the guide or source directory |
| [REDENOMINATION](REDENOMINATION/README.md) | Code and guide | demo&#58;redenomination, demo&#58;redenomination&#58;control&#45;room, demo&#58;redenomination&#58;export |
| [solving&#45;alpha&#45;agi&#45;governance](solving-alpha-agi-governance/README.md) | Code and guide | Open the guide or source directory |
| [sovereign&#45;constellation](sovereign-constellation/README.md) | Code and guide | demo&#58;sovereign&#45;constellation, demo&#58;sovereign&#45;constellation&#58;asi&#45;takes&#45;off, demo&#58;sovereign&#45;constellation&#58;asi&#45;takes&#45;off&#58;flight&#45;plan |
| [sovereign&#45;mesh](sovereign-mesh/README.md) | Code and guide | Open the guide or source directory |
| [superintelligent&#45;empowerment](superintelligent-empowerment/README.md) | Code and guide | Open the guide or source directory |
| [tests](tests) | Supporting code / assets | Open the guide or source directory |
| [Tiny&#45;Recursive&#45;Model&#45;v0](Tiny-Recursive-Model-v0/README.md) | Code and guide | Open the guide or source directory |
| [TRIDENT&#45;SOVEREIGN&#45;AGI&#45;ORCHESTRATOR](TRIDENT-SOVEREIGN-AGI-ORCHESTRATOR/README.md) | Code and guide | demo&#58;trident&#45;sovereign, demo&#58;trident&#45;sovereign&#58;ui |
| [Trustless&#45;Economic&#45;Core&#45;v0](Trustless-Economic-Core-v0/README.md) | Code and guide | Open the guide or source directory |
| [validator&#95;constellation&#95;v0](validator_constellation_v0) | Supporting code / assets | Open the guide or source directory |
| [Validator&#45;Constellation&#45;v0](Validator-Constellation-v0/README.md) | Code and guide | demo&#58;validator&#45;constellation, demo&#58;validator&#45;constellation&#58;scenario, demo&#58;validator&#45;constellation&#58;operator&#45;console |
| [zenith&#45;sapience](zenith-sapience/README.md) | Code and guide | Open the guide or source directory |
| [zenith&#45;sapience&#45;initiative&#45;celestial&#45;archon&#45;governance](zenith-sapience-initiative-celestial-archon-governance/README.md) | Code and guide | demo&#58;zenith&#45;sapience&#45;celestial&#45;archon, demo&#58;zenith&#45;sapience&#45;celestial&#45;archon&#58;local |
| [zenith&#45;sapience&#45;initiative&#45;global&#45;governance](zenith-sapience-initiative-global-governance/README.md) | Code and guide | demo&#58;zenith&#45;sapience&#45;initiative, demo&#58;zenith&#45;sapience&#45;initiative&#58;local |
| [zenith&#45;sapience&#45;initiative&#45;omega&#45;omni&#45;operating&#45;system](zenith-sapience-initiative-omega-omni-operating-system/README.md) | Code and guide | Open the guide or source directory |
| [zenith&#45;sapience&#45;initiative&#45;omnidominion&#45;governance](zenith-sapience-initiative-omnidominion-governance/README.md) | Code and guide | demo&#58;zenith&#45;sapience&#45;omnidominion, demo&#58;zenith&#45;sapience&#45;omnidominion&#58;local |
| [zenith&#45;sapience&#45;initiative&#45;planetary&#45;operating&#45;system&#45;governance](zenith-sapience-initiative-planetary-operating-system-governance/README.md) | Code and guide | demo&#58;zenith&#45;sapience&#45;planetary&#45;os, demo&#58;zenith&#45;sapience&#45;planetary&#45;os&#58;local |
| [zenith&#45;sapience&#45;initiative&#45;supra&#45;sovereign&#45;hypernova&#45;governance](zenith-sapience-initiative-supra-sovereign-hypernova-governance/README.md) | Code and guide | demo&#58;zenith&#45;hypernova, demo&#58;zenith&#45;hypernova&#58;local, demo&#58;zenith&#45;hypernova&#58;work |

### Nested guides and variants

- [AGI&#45;Alpha&#45;Node&#45;v0&#47;grand&#95;demo&#47;README&#46;md](AGI-Alpha-Node-v0/grand_demo/README.md)
- [AGI&#45;Alpha&#45;Node&#45;v0&#47;grandiose&#95;alpha&#95;demo&#47;README&#46;md](AGI-Alpha-Node-v0/grandiose_alpha_demo/README.md)
- [AGI&#45;Jobs&#45;Platform&#45;at&#45;Kardashev&#45;II&#45;Scale&#47;k2&#45;stellar&#45;demo&#47;README&#46;md](AGI-Jobs-Platform-at-Kardashev-II-Scale/k2-stellar-demo/README.md)
- [AGI&#45;Jobs&#45;Platform&#45;at&#45;Kardashev&#45;II&#45;Scale&#47;k2&#45;stellar&#45;demo&#47;output&#47;README&#46;md](AGI-Jobs-Platform-at-Kardashev-II-Scale/k2-stellar-demo/output/README.md)
- [AGI&#45;Jobs&#45;Platform&#45;at&#45;Kardashev&#45;II&#45;Scale&#47;output&#47;README&#46;md](AGI-Jobs-Platform-at-Kardashev-II-Scale/output/README.md)
- [AGI&#45;Jobs&#45;Platform&#45;at&#45;Kardashev&#45;II&#45;Scale&#47;output&#47;governance&#45;playbook&#46;md](AGI-Jobs-Platform-at-Kardashev-II-Scale/output/governance-playbook.md)
- [AGI&#45;Jobs&#45;Platform&#45;at&#45;Kardashev&#45;II&#45;Scale&#47;stellar&#45;civilization&#45;lattice&#47;README&#46;md](AGI-Jobs-Platform-at-Kardashev-II-Scale/stellar-civilization-lattice/README.md)
- [AGI&#45;Jobs&#45;Platform&#45;at&#45;Kardashev&#45;II&#45;Scale&#47;stellar&#45;civilization&#45;lattice&#47;output&#47;README&#46;md](AGI-Jobs-Platform-at-Kardashev-II-Scale/stellar-civilization-lattice/output/README.md)
- [CULTURE&#45;v0&#47;apps&#47;culture&#45;studio&#47;README&#46;md](CULTURE-v0/apps/culture-studio/README.md)
- [CULTURE&#45;v0&#47;backend&#47;arena&#45;orchestrator&#47;README&#46;md](CULTURE-v0/backend/arena-orchestrator/README.md)
- [CULTURE&#45;v0&#47;ci&#47;README&#46;md](CULTURE-v0/ci/README.md)
- [CULTURE&#45;v0&#47;contracts&#47;README&#46;md](CULTURE-v0/contracts/README.md)
- [CULTURE&#45;v0&#47;indexers&#47;culture&#45;graph&#45;indexer&#47;README&#46;md](CULTURE-v0/indexers/culture-graph-indexer/README.md)
- [CULTURE&#45;v0&#47;reports&#47;README&#46;md](CULTURE-v0/reports/README.md)
- [CULTURE&#45;v0&#47;scripts&#47;README&#46;md](CULTURE-v0/scripts/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;k2&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;k2&#95;omega&#95;upgrade&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2_omega_upgrade/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;k2&#95;omega&#95;upgrade&#47;storage&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_k2_omega_upgrade/storage/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;omega&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;supreme&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;ultra&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;upgrade&#95;for&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;upgrade&#95;for&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;v2&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v2/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;upgrade&#95;for&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;v3&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v3/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;upgrade&#95;for&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;v4&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v4/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;upgrade&#95;for&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;v5&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v5/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;upgrade&#95;for&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;v6&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v6/README.md)
- [Kardashev&#45;II Omega&#45;Grade&#45;α&#45;AGI Business&#45;3&#47;kardashev&#95;ii&#95;omega&#95;grade&#95;upgrade&#95;for&#95;alpha&#95;agi&#95;business&#95;3&#95;demo&#95;v7&#47;README&#46;md](Kardashev-II%20Omega-Grade-%CE%B1-AGI%20Business-3/kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo_v7/README.md)
- [LARGE&#45;SCALE&#45;OMEGA&#45;BUSINESS&#45;3&#47;computer&#45;work&#47;README&#46;md](LARGE-SCALE-OMEGA-BUSINESS-3/computer-work/README.md)
- [LARGE&#45;SCALE&#45;OMEGA&#45;BUSINESS&#45;3&#47;ui&#47;operator&#45;playbook&#46;md](LARGE-SCALE-OMEGA-BUSINESS-3/ui/operator-playbook.md)
- [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0&#47;meta&#95;agentic&#95;alpha&#95;prime&#95;demo&#47;README&#46;md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_prime_demo/README.md)
- [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0&#47;meta&#95;agentic&#95;alpha&#95;v10&#47;README&#46;md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v10/README.md)
- [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0&#47;meta&#95;agentic&#95;alpha&#95;v11&#47;README&#46;md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v11/README.md)
- [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0&#47;meta&#95;agentic&#95;alpha&#95;v2&#47;README&#46;md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v2/README.md)
- [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0&#47;meta&#95;agentic&#95;alpha&#95;v3&#47;README&#46;md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v3/README.md)
- [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0&#47;meta&#95;agentic&#95;alpha&#95;v4&#47;README&#46;md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v4/README.md)
- [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0&#47;meta&#95;agentic&#95;alpha&#95;v5&#47;README&#46;md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v5/README.md)
- [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0&#47;meta&#95;agentic&#95;alpha&#95;v6&#47;README&#46;md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v6/README.md)
- [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0&#47;meta&#95;agentic&#95;alpha&#95;v7&#47;README&#46;md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v7/README.md)
- [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0&#47;meta&#95;agentic&#95;alpha&#95;v8&#47;README&#46;md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v8/README.md)
- [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0&#47;meta&#95;agentic&#95;alpha&#95;v9&#47;README&#46;md](Meta-Agentic-ALPHA-AGI-Jobs-v0/meta_agentic_alpha_v9/README.md)
- [Meta&#45;Agentic&#45;ALPHA&#45;AGI&#45;Jobs&#45;v0&#47;reports&#47;owner&#45;playbook&#46;md](Meta-Agentic-ALPHA-AGI-Jobs-v0/reports/owner-playbook.md)
- [OMNIPHOENIX&#45;ASCENDANT&#45;HYPERSTRUCTURE&#47;disruption&#47;README&#46;md](OMNIPHOENIX-ASCENDANT-HYPERSTRUCTURE/disruption/README.md)
- [One&#45;Box&#47;computer&#45;work&#47;README&#46;md](One-Box/computer-work/README.md)
- [Phase&#45;8&#45;Universal&#45;Value&#45;Dominance&#47;output&#47;phase8&#45;guardian&#45;response&#45;playbook&#46;md](Phase-8-Universal-Value-Dominance/output/phase8-guardian-response-playbook.md)
- [REDENOMINATION&#47;archives&#47;fixed&#45;stake&#45;before&#45;percentage&#47;README&#46;md](REDENOMINATION/archives/fixed-stake-before-percentage/README.md)
- [TRIDENT&#45;SOVEREIGN&#45;AGI&#45;ORCHESTRATOR&#47;ui&#47;operator&#45;playbook&#46;md](TRIDENT-SOVEREIGN-AGI-ORCHESTRATOR/ui/operator-playbook.md)
- [Validator&#45;Constellation&#45;v0&#47;v2&#47;README&#46;md](Validator-Constellation-v0/v2/README.md)
- [agi&#45;governance&#47;alpha&#45;v13&#47;README&#46;md](agi-governance/alpha-v13/README.md)
- [agi&#45;governance&#47;alpha&#45;v13&#47;RUNBOOK&#46;md](agi-governance/alpha-v13/RUNBOOK.md)
- [agi&#45;governance&#47;alpha&#45;v14&#47;README&#46;md](agi-governance/alpha-v14/README.md)
- [agi&#45;governance&#47;alpha&#45;v14&#47;RUNBOOK&#46;md](agi-governance/alpha-v14/RUNBOOK.md)
- [agi&#45;governance&#47;alpha&#45;v15&#47;README&#46;md](agi-governance/alpha-v15/README.md)
- [agi&#45;governance&#47;alpha&#45;v15&#47;RUNBOOK&#46;md](agi-governance/alpha-v15/RUNBOOK.md)
- [agi&#45;governance&#47;alpha&#45;v16&#47;README&#46;md](agi-governance/alpha-v16/README.md)
- [agi&#45;governance&#47;alpha&#45;v16&#47;RUNBOOK&#46;md](agi-governance/alpha-v16/RUNBOOK.md)
- [agi&#45;governance&#47;alpha&#45;v17&#47;README&#46;md](agi-governance/alpha-v17/README.md)
- [agi&#45;governance&#47;alpha&#45;v17&#47;RUNBOOK&#46;md](agi-governance/alpha-v17/RUNBOOK.md)
- [alpha&#45;agi&#45;insight&#45;mark&#47;runbooks&#47;operator&#45;runbook&#46;md](alpha-agi-insight-mark/runbooks/operator-runbook.md)
- [alpha&#45;agi&#45;mark&#47;runbooks&#47;alpha&#45;agi&#45;mark&#45;runbook&#46;md](alpha-agi-mark/runbooks/alpha-agi-mark-runbook.md)
- [cosmic&#45;omni&#45;sovereign&#45;symphony&#47;docs&#47;RUNBOOK&#46;md](cosmic-omni-sovereign-symphony/docs/RUNBOOK.md)
- [cosmic&#45;omni&#45;sovereign&#45;symphony&#47;docs&#47;flagship&#45;runbook&#46;md](cosmic-omni-sovereign-symphony/docs/flagship-runbook.md)
- [cosmic&#45;omni&#45;sovereign&#45;symphony&#47;docs&#47;observability&#45;playbook&#46;md](cosmic-omni-sovereign-symphony/docs/observability-playbook.md)
- [kardashev&#95;ii&#95;omega&#95;grade&#95;alpha&#95;agi&#95;business&#95;3&#47;workbench&#47;README&#46;md](kardashev_ii_omega_grade_alpha_agi_business_3/workbench/README.md)
- [sovereign&#45;constellation&#47;asi&#45;takes&#45;off&#45;demo&#47;README&#46;md](sovereign-constellation/asi-takes-off-demo/README.md)
- [superintelligent&#45;empowerment&#47;docs&#47;README&#46;md](superintelligent-empowerment/docs/README.md)
- [superintelligent&#45;empowerment&#47;web&#47;README&#46;md](superintelligent-empowerment/web/README.md)

<!-- demo-catalog:end -->
