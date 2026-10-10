# Deployment readiness index

This page maps the evidence needed for launch. It does not mark the system production-ready. Read the [current status](readiness.md) first.

| Question | Current entry point | Evidence to retain |
| --- | --- | --- |
| Can a nontechnical person begin? | [Welcome guide](https://montrealai.github.io/AGIJobsv0/start/) | A draft and chosen next step; no account or payment implied |
| What must a coordinator approve? | [Plain-language deployment guide](nontechnical-mainnet-deployment.md) | Approved network, addresses, economics and responsible signers |
| How do we rehearse and deploy? | [Staged Hardhat guide](../deployment-v2-agialpha.md) | Read-only plan, fresh transaction journal and confirmed deployment report |
| Are contracts within chain limits? | [Fixed implementations](fixed-implementations.md) | Production compilation, size checks and staged gas tests |
| Who controls the stack? | [Security and governance](../security-deployment-guide.md) | Actual owners, pending acceptances and tested pause controls |
| Can source be released? | [Release checklist](../release-checklist.md) | Exact-commit CI, signing and dependency evidence; correct release classification |
| Are workers and providers ready? | [Current readiness](readiness.md#what-a-live-deployment-still-needs) | Real commissioning, independent review, spending/stop and recovery evidence |
| What do local simulations prove? | [Production rehearsal](rehearsal.md) | Bounded, reproducible simulation evidence with its limitations |

A passing website build, source prerelease or read-only plan does not authorize a transaction or clear production gates. Commands differ in their side effects; use the current command-specific guide instead of copying historical flags into Hardhat.
