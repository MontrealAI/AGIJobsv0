# Disposable governance configuration v1

`config/multinational-governance.json` is a synthetic, disposable Hardhat fixture.
Its owner and governors are public Hardhat development accounts, never live
operator credentials or evidence of deployed authority. This repair changes only
that bundled fixture and its governance script input boundary. Existing deployed/live
configurations, contracts, balances and governance design are unchanged.

## Exact identifier encoding

The Council ABI requires `bytes32`. The bundled fixture explicitly encodes the
following original ASCII bytes and appends zero bytes **on the right** until each
value is exactly 32 bytes. The spelling and content of the original labels are
preserved, including `COOLITION` in the Pacific identifier:

| Field | Original ASCII bytes | Original byte count | Appended zero bytes |
| --- | --- | ---: | ---: |
| pauserRole | `pauserrole:cosmic-omni` | 22 | 10 |
| first nation ID | `GLOBAL_NORTHERN_ALLIANCE` | 24 | 8 |
| second nation ID | `PACIFIC_COOLITION_SOVEREIGN` | 27 | 5 |
| mandate ID | `GOVERNANCE_HARMONY` | 18 | 14 |

Every vote reference contains exactly the same resulting nation/mandate bytes.
This is a documented, one-time fixture edit. Runtime inputs must already contain
`0x` and exactly 64 lowercase hexadecimal digits, with a nonzero value. No script
pads, trims, hashes, truncates, case-folds or otherwise converts identifiers.
Text, short/oversized hex, mixed/uppercase hex and zero IDs fail closed. Nation
IDs and mandate IDs are unique within their respective contract namespaces.

Do not automatically migrate another configuration or assume a live identifier
has these ASCII semantics. An external configuration requires explicit review of
its intended 32-byte identities and references, followed by a deliberate v1
migration. Missing version/fields are errors; the previous omitted/zero owner
fallback and omitted pauser-role fallback are not available in this version.

## Shape and bounds

The published shape is `config/multinational-governance.schema.v1.json`; the
shared `scripts/governance-config.ts` validator enforces it plus semantic checks.
All four entry points (deploy, seed, simulate, export) validate the complete
configuration before accessing Hardhat/provider methods. Export requires the
configuration rather than silently omitting its mandate records.

- Root keys, all required: `schemaVersion` (exactly numeric `1`), `owner`,
  `pauserRole`, `nations`, `mandates`, `votes`. Unknown keys are rejected at every
  object level. There are no coercions or implicit defaults.
- Owner/governors and the resolved deployment target must be nonzero 20-byte
  Ethereum addresses. Mixed-case addresses must have a valid checksum.
- At most 256 nations, 256 mandates and 4096 vote entries. Empty collections are
  allowed; simulation additionally requires at least one vote.
- Nation keys: `id`, `governor`, `weight`, `metadataURI`. Weight is a positive safe
  integer, at most 9007199254740991 (a deliberately narrower subset of `uint96`).
- Mandate keys: `id`, `quorum`, `metadataURI`, `startDelaySeconds`,
  `durationSeconds`. Quorum is a positive safe integer, a subset of `uint256`.
  Delay/duration are nonnegative safe integers. The current timestamp plus delay,
  and then duration when nonzero, must remain within the same safe-integer bound.
  Seed resolves all windows before its first transaction and passes bigint ABI
  values without lossy Number conversion. Wall-clock time still supplies the
  seed base, as in the original script; it is not a chain-time attestation.
- Vote keys: `mandateId`, `nationId`, `support`, `metadataURI`. References must
  exist in the corresponding configured collection; support must be a boolean.
- Metadata is a string of at most 2048 Unicode scalar characters. It may be empty;
  validation does not fetch metadata or attest its content.

The raw JSON reader accepts only regular files of at most 1 MiB and depth 8.
It uses fixed-size reads (including detection of file growth), closes descriptors
on failure, and rejects final-path symlinks where `O_NOFOLLOW` is supported. Malformed UTF-8,
UTF-8 BOM, malformed Unicode strings, duplicate keys (including escaped
spellings), trailing/invalid JSON and ambiguous numeric tokens are rejected.
Numbers must be nonnegative canonical decimal integer tokens: no negative zero,
fractions, exponent notation, unsafe integers, NaN or infinity. The preflight
byte/depth/token gate runs before the existing duplicate-aware
`parsePhase6Json` parser; that shared parser is unchanged. The raw boundary also
applies to deployment-log input. A JSON Schema tool alone does not establish
these raw-byte, address-checksum, ID/reference or derived-time guarantees.

## Preserved contract semantics

The Solidity contract is unchanged. Duration `0` still means an open-ended
mandate. Repeated `(mandateId, nationId)` votes are ordered recasts; the Council
subtracts the old weight and applies the current vote. Multiple nations may have
the same governor. A quorum above configured total weight is legal and is not
silently reduced or rejected; it may remain unreachable. IDs in different
namespaces can coincide. The demo's positive weight/quorum and input size rules
are client-side safety constraints, not new Solidity rules.

`pauserRole` is stored metadata in the current Council; `pause` and `unpause` are
owner-only. This fixture does not invent role-based authorization. Simulation
uses disposable Hardhat impersonation and balance/time RPCs, and checks on-chain
time bounds before converting a time advance to a Number. Export fails if a
configured mandate does not exist on-chain, instead of emitting its zero-valued
mapping default as a real mandate.

## Evidence and remaining qualification

The inert suite executes exact TypeScript/CommonJS sources with stubbed
Hardhat/provider/filesystem effects, including the real shared validators.
It checks malformed input rejection across all four entry points, shape/schema
agreement, bounded reads, ABI encoding using signatures extracted from the
Council source, ethers tuple field names, seed values, vote references/recasts,
owner-control sequencing and failure propagation. Existing mode/local-config
regressions remain required by the Cosmic workflow. Changes to the reused
Phase6 parser also trigger that workflow.

These are source and inert tests only. No Solidity build, node, transaction,
live deployment or complete disposable rehearsal was performed for this repair.
Independent schema review and a separately authorized, qualified disposable
`deploy → seed → vote → export → cleanup` proof are still required. Passing these
tests is not operational, mainnet, production or economic qualification.
