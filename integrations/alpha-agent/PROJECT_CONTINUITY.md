# Continue an Alpha project through Jobs v0

`project-transfer.mjs` adds a browser-safe, dependency-free receiver for the
native Alpha `successor-project/v1` dossier. The exact original UTF-8 bytes,
project and cycle IDs, all source cycles, failed attempts and rejected reviews
remain inside `original.raw`. The receiver invokes the unmodified, pinned
native project validator and semantically replays native CSV results; an outer
checksum is insufficient.

The currently supported mission is **public or synthetic integer CSV totals**.
Its original `successor-workbench/v1` specification is retained in
`work.nativeSpecRaw`. The separately committed `work.specRaw` has namespace
`agijobsv0.successor-public-data-work.v1`: it binds the exact project/cycle,
upstream bytes, source identity, AGIALPHA route, fixed JavaScript executor,
native specification and selected base-unit allowance. It is a source-only
project work envelope, not `agialpha.bounded-work-spec.v1` accepted by the
existing Python Alpha market adapter.
This is not a translation to Alpha's Python research/allocation work kinds.
Every duplicate source row and integer unit remains unchanged. Source rights are
supplied declarations that require review, not automatically established licenses.

## Three local steps

No wallet, model provider or installation from another checkout is needed.
Choose the AGIALPHA planning amount in exact 18-decimal **base units** separately.
It is an unfunded draft allowance; it does not convert a Manager USDC price.
For example, `7000000000000000000` means 7 AGIALPHA. The minimum is seven
base units, one for each draft work order; remainders are allocated exactly in
the compiled work-order sequence.

```sh
node integrations/alpha-agent/project-cli.mjs import alpha-project.json 7000000000000000000 2026-10-16T00:00:00.000Z jobs-project.json
node integrations/alpha-agent/project-cli.mjs run jobs-project.json jobs-result.json
node integrations/alpha-agent/project-cli.mjs inspect jobs-result.json
```

Import does not execute the task. It uses the actual Jobs v0 `compileJobs`
compiler to seal seven bounded, unsigned **DRAFT** work orders with the chosen
AGIALPHA planning allowance. Their capability requests remain ungranted. `run`
executes the pinned fixed JavaScript public-data implementation locally and
appends the complete native mission record and result pack, with its actual
observed elapsed time. The execution itself has zero provider/settlement spend;
compute price and human time remain unmeasured. Results remain unreviewed.

Every output refuses to overwrite an existing file. Stable, regular, no-symlink
UTF-8 inputs and native dossier validation are required. Leading UTF-8 BOMs
and malformed UTF-8 are rejected without normalizing the original bytes. The transfer has a
2 MB UTF-8 limit and eight checkpoints. A full or oversized transfer fails
without pruning its history; retain the last unchanged checkpoint.

## Browser API

```js
import { importAlphaProject, inspectProjectTransfer, runProjectTransfer }
  from './integrations/alpha-agent/project-transfer.mjs';
const draft = await importAlphaProject(projectBytes, {
  amountBaseUnits: '7000000000000000000',
  compiledAt: new Date().toISOString()
});
const result = await runProjectTransfer(draft);
const { transfer, project, spec, lastRecord } = await inspectProjectTransfer(result);
```

No imported file selects code, a provider, an executable checkout or a callback.
The vendored validator's complete ten-module closure and license are recorded
in `project-native-source.mjs`, pinned to Alpha commit
`92e227c007d484323c7fd2a7001b9bb5b229e717`. The receiver, receipt adapter and CLI have a separate complete source hash
inventory; the four actual Jobs compiler files are pinned separately. Regression tests compare every installed byte to these
inventories.

An application may install a separately reviewed Manager-native inspector as
`managerInspector: { source, inspect }` in **application code**. Its `inspect`
function must invoke Manager's native transfer/capsule/history validators and
return `originalProject`. The Jobs receiver then validates the unchanged native
Alpha original and binds both identities. Imports never install this inspector;
without it, a Manager wrapper is rejected. Direct Alpha → Jobs v0 uses no
Manager or currency conversion.

## Fleet and return history

The inspected `transfer.project`, `transfer.route`, exact `original.raw` and
`work.nativeSpecRaw` can be carried in Fleet's explicit project request. Fleet maps
the same bounded CSV into its separately admitted deterministic `successor-run`
executor. The execution adapter is separate from the **AGIALPHA JobRegistry**
route. No Python `alpha-run` support or installed Alpha package is inferred.

Return the **complete** Jobs transfer or Fleet project-return envelope to
Alpha's guided project history. Preserve their exact raw bytes as historical
attachments. A Fleet internal checker is a local check, not an unrelated
independent reviewer, protected evaluation or contract validation approval.

## Bind an actual lifecycle receipt

The existing `verify-receipt.cjs` verifier remains unchanged.
`project-receipt.cjs` exports `verifyProjectReceipt(raw, options)` for an
explicitly configured, read-only ethers provider. It first runs the native
project validators, then fetches the canonical lifecycle receipt itself,
verifies the full pinned registry runtime, chain, event, worker and finality,
and reads the matching job and staking token at that block. `jobs.specHash`
must equal SHA-256 of the exact bound `work.specRaw` envelope, and
`jobs.reward` must equal the selected AGIALPHA base-unit allowance. Thus an
assignment for identical CSV from another project or price cannot be reused.
For submission, validation and
finalization, the on-chain `resultHash` must equal SHA-256 of the exact latest
local native record bytes. The worker, trusted token and the token's actual 18 decimals must also agree. The
block is rechecked after the state reads.

The deployment must explicitly declare `scope: 'disposable-local-fixture'`
with its actual mock token or `scope: 'reviewed-deployment'` with the configured
AGIALPHA token. A historical masked runtime-template hash is insufficient.
Never infer deployment approval from the scope label; independently review
runtime/delegate pins, wiring, governance, current state and admission first.
The returned `agijobsv0/project-receipt/v1` retains the entire exact transfer
and observed event, with `payoutReconciled: false`, `productionApproved: false`
and no settlement authority. Reverify its RPC observation before use.
The focused project-receipt tests use RPC doubles, not a new mainnet or live
payment acceptance. Existing disposable-chain evidence remains documented in
the parent README.

These adapters leave live intake closed, existing deployment records intact,
MARK / AscensionJobMarket distinct, and Manager's **USDC** route separate.
They do not grant operational admission, inherit protected evaluation, approve
payouts, sign transactions, acknowledge tax policy or claim production
qualification.

Run `npm run alpha-agent:project:test` and `npm run alpha-agent:verify:test`.
The CLI and browser receiver need only Node/WebCrypto; the read-only Ethereum
receipt adapter uses the repository's existing ethers dependency.

## Français

Le récepteur conserve les octets exacts du dossier Alpha et tous ses cycles,
échecs et examens rejetés. Il valide réellement les données natives et compile
sept tâches **DRAFT** non financées avec le compilateur Jobs v0. Seul le CSV
entier `group,amount` est pris en charge. Le montant $AGIALPHA en unités de base
est choisi séparément; aucun prix USDC n'est converti.

`run` exécute le calcul JavaScript délimité et conserve son résultat complet.
La vérification Fleet reste locale; elle ne constitue pas une revue
indépendante ni une acceptation contractuelle. Les observations de reçus sont
reliées aux empreintes exactes du projet, du travail et du résultat et doivent
être revérifiées. Aucune autorité, qualification de production, signature,
permission ou ouverture des admissions payantes n'est créée.
