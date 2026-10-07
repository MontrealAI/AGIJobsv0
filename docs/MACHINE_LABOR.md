# AGI Jobs: the machine labor workflow

AGI Jobs is designed as a scalable machine labor layer for authorized, lawful screen-based work. It coordinates specialized workers, reviewable evidence, independent verification and settlement across computer-based workflows. Its scope includes software, analysis, research, documents, browser tasks and desktop applications, subject to the capabilities and permissions of each commissioned worker.

**Start with a useful outcome:** [design a job](https://montrealai.github.io/AGIJobsv0/work/), [explore the demos](https://montrealai.github.io/AGIJobsv0/), or [connect an admitted computer-work worker](computer-work.md).

## A complete work order

The public planner provides ten starting categories: performance optimization, open-source features, API/SDK tooling, automated tests, AI evaluation, public-data dashboards, interactive applications, vendor/product intelligence, executable documentation and scientific reproduction. These are proposed work templates, not evidence of completed buyer engagements.

Each draft contains the exact objective, scope, approved source references, origin allowlist, expected files, acceptance conditions, proposed reward and review allowance. Source rights, availability and runtime capabilities must be checked by the operator. Public availability does not itself establish a license or permission to republish.

| Stage | Required result | Who accepts responsibility |
| --- | --- | --- |
| Scope | Concrete deliverables and measurable acceptance criteria | Buyer |
| Admit | Exact reviewed task digest, allowed inputs/actions and commissioned environment | Operator |
| Execute | Candidate artifacts, action log, source hashes, tool versions and reproducible checks | Worker |
| Check | Content verification, recalculated results and failure analysis | Checker |
| Review | Independent acceptance decision and disclosed conflicts | Independent reviewer |
| Accept | Confirmation that the delivered work meets the buyer's need | Buyer |
| Settle | Authorized settlement under the actual contract and dispute rules | Settlement signer and deployed protocol |

A structurally valid file, matching content hash, provider completion status or green test suite cannot substitute for independent content review and actual buyer acceptance. Count delivered value through useful accepted work, reproducibility, buyer use, total cost, reviewer time and successful authorized settlement. Preserve rejected results, uncertain effects and failed attempts in the denominator.

## Download and execute

The planner is static and browser-local. It does not fetch sources, persist form data, invoke a provider, connect a wallet or publish anything. Editing any field invalidates the last built draft. The three downloads have different purposes:

- `work-proposal.json`: commercial proposal, unassigned roles, proposed limits and explicitly ungranted authorizations.
- `task.json`: the existing `ComputerWorkTask` schema, ready for read-only inspection by the repository's adapter.
- `handoff.txt`: operator workflow and JSON-encoded task data. Source content cannot grant execution authority.

Use the pinned [development setup](START_HERE.md), then inspect the task:

```bash
npm run build:orchestrator
node demo/One-Box/computer-work/run.cjs inspect /absolute/path/task.json
```

Inspection does not dispatch work. Follow the [computer-work admission and recovery guide](computer-work.md) to configure the protected worker profile, verify actual runtime controls, assign a job ID and admit the exact digest. Changed bytes require renewed review. Do not generate admissions automatically from untrusted proposals.

OpenClaw is an implemented Responses adapter route. The configured worker supplies its real browser, desktop, code and file capabilities. ChatGPT Work is an operator-led route using its available tools and permission controls, with evidence exported for review; this repository does not offer a remote Work API. The direct OpenAI computer tool is an extension route requiring an environment and tool-call loop. Neither a planner selection nor a profile name provisions those capabilities.

The current adapter returns bounded UTF-8 JSON, CSV, Markdown and plain text. Patches and small source packages can be represented in those formats. Editable Office documents, screenshots, binary archives and larger applications require a separately commissioned artifact store with integrity and retrieval checks; this planner does not silently claim binary upload support.

## Budgets and capacity

Proposal rewards are expressed in USDC with six-decimal integer arithmetic. They are not funded escrow, provider spending caps or automatic token conversions. This repository's existing v2 contracts use 18-decimal AGIALPHA. Confirm the actual deployed token, network, addresses and settlement rules before any funding or transaction.

Run and reviewer allowances are planning constraints. Enforce real time, spending, application, network and cancellation controls in the runtime; writing a limit into a prompt is insufficient. Independent review and buyer demand constrain throughput alongside worker performance. Begin with representative tasks and rejection cases, measure useful delivery, and expand only when the evidence supports it.

The **$40 trillion/year** screen-based labor opportunity is a user-supplied planning assumption. It is not a verified market estimate, obtainable revenue or demonstrated automation coverage. Practical serviceable scope depends on permissions, task reliability, unit economics, independent review and buyer adoption.

## The long horizon

The vision is to compound useful digital work into stronger software, research and productive infrastructure, then coordinate increasingly ambitious scientific and engineering programs. Planetary and stellar scenarios make resource allocation and governance inspectable; their modeled physical outcomes remain ambitions requiring external engineering, experiments and independent validation.

All original demos and flowcharts remain available. The [readiness index](production/readiness.md) separates reproducible local checks from authentic deployment requirements.
