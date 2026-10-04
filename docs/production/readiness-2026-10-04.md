# Readiness update: computer work and execution correctness

This update extends the [2026-10-03 readiness record](readiness-2026-10-03.md) and the published One-Box improvements. It preserves the existing contracts, token rules, demos and diagrams. It is a scoped engineering verification record, not a declaration that every subsystem or production deployment is independently certified.

## Concrete changes

| Area | Result |
| --- | --- |
| Computer-work execution | A dedicated pipeline invokes operator-admitted OpenClaw Responses workers; native Codex desktop capabilities remain owned and permissioned by the configured worker. |
| Dispatch safety | Exact task hashes and job IDs, isolated sessions, protected token references, bounded HTTP requests, persistent exclusive journals and no automatic retry after dispatch. |
| Evidence and settlement | Typed text artifacts receive local SHA-256 hashes. The meta-orchestrator submits the actual manifest content hash instead of attempting premature finalization. Structural validation abstains on computer-work evidence. Positive learning credit and dependent jobs wait for actual on-chain validation completion. Durable handoffs recover events missed during restart; uncertain side effects require reconciliation. Fund finalization remains separate. |
| Outbound requests | Untrusted job endpoints require exact operator approval. Job and result downloads require approved origins, reject redirects and have time/size bounds. |
| Python execution | Missing live runtimes and unknown live tools fail. Interrupted bridge calls do not become simulation or retry; simulated work is labeled and excluded from success credit. |
| User experience | A complete supplier-desk browser lab, correct/incorrect outputs, inspectable receipts and screenshots, independent acceptance rules, setup/recovery guidance, and links from the existing One-Box experience. |
| Current capability claims | Official OpenClaw/OpenAI interfaces are cited and scoped. The $40T/year vision is identified as a planning assumption, not verified market data. |

## Reproduce the checks

Use the pinned [development setup](../START_HERE.md). From the repository root:

```bash
npm run build:orchestrator
node --test apps/orchestrator/dist/apps/orchestrator/__tests__/computerWork.test.js
npx playwright install chromium
node --test demo/One-Box/computer-work/test.cjs
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest test/orchestrator
npm run demos -- --check
npm run site:build
npm run site:test
```

The Pages build also needs the existing CULTURE workspace dependencies described in [the website guide](../../website/README.md). The core and orchestrator workflows run the new checks; the browser workflow retains receipts, screenshots, accessibility results and rejected evidence as CI artifacts. Python regression tests run in core CI.

The browser lab performs actual isolated Chromium actions. Its agent decisions and provider responses are synthetic. The independent fixture rules accept the correct supplier with eleven checks and reject the wrong supplier even when artifact hashes and JSON structure are valid. These checks establish their named behavior; they do not establish model reliability, third-party security review, or live network commissioning.

## Dependency audit finding

A fresh root `npm audit --omit=dev --json` on 2026-10-04 reported **136 affected dependency packages: 3 critical, 40 high, 72 moderate and 21 low**. The critical package families are `fast-xml-parser`, `protobufjs` and `tar`. These registry findings are a release blocker pending remediation and compatibility tests; package severity is not itself proof that every application path is exploitable. This computer-work change does not modify the dependency lockfile or claim those findings are resolved. Track dependency remediation separately and rerun the audit against the exact release tree.

Dependency remediation and remaining blockers are tracked in the [dependency review](dependency-review-2026-10-04.md), which supersedes the baseline counts above for its exact tested tree.

## Production gates still requiring authentic evidence

- An operator-owned, isolated live gateway with verified permissions, account selection, network/action policies, spending controls, stop/recovery behavior and measured task success.
- Independent acceptance evaluators and validators for each work category; content hashes and provider status are insufficient.
- Authorized release signing and a real independent security review. Test signatures and fixture reports cannot replace them.
- Target-network configuration, deployed-bytecode/ownership verification, identity/tax/stake prerequisites, monitoring and a completed commissioning lifecycle.
- Dependency and external-provider reassessment at deployment time. Passing repository CI is a reproducible baseline, not a perpetual guarantee that all future dependency versions or services are safe.

See [the computer-work guide](../computer-work.md) for exact supported paths, migration configuration and recovery. No live provider account, human desktop session, production credential or funded network is silently provisioned by the fixture.
