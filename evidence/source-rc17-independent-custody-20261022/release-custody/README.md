# rc17 independent public asset custody

This packet records read-only independent custody verification of [MontrealAI/AGIJobsv0 release 420279454](https://github.com/MontrealAI/AGIJobsv0/releases/tag/source-v2.1.0-rc.17), published 2026-10-22T03: 34:13Z as a source prerelease.

- Tag: `source-v2.1.0-rc.17`.
- Exact source: `ba67d5d19ef7d9ac643f99f2b8f49c160714fdf6`.
- Exact tree: `16c29d934e8bb4d36d286fae7fbf3f9b9d506a85`.
- Release target and public tag reference match that source.
- `productionApproved: false`.

The successful publisher was run 39710971421 attempt 2, job 119622402171. Pages run 39710971389 attempt 4 also succeeded. These later attempts were performed by concurrent work; this custody verifier and the root publisher did not initiate those retries. The earlier publisher attempt 1 remains a failure, and the earlier Pages attempt 2 remains a failure. Their original attempt metadata is retained under `workflow-attempts/`. Earlier retained logs identify Pages as the original publication blocker and a pinned pnpm 10.5.2 HTTP503 failure in Pages attempt 2. Later success does not rewrite those failures.

## Independently verified bytes

All 25 actual public release assets were downloaded: 173,653,961 bytes. Every API byte size and SHA256 digest matched. The release's own `SHA256SUMS.txt` names exactly the other 24 public assets and matches their downloaded bytes. That original checksum file is preserved at `release-assets/SHA256SUMS.txt`.

All 7 ZIPs passed unique/safe-path checks and every member CRC and SHA256 read. Their full inventories are retained under `zip-inventories/`. The source ZIP is 159,983,540 bytes, SHA256 `4aff5e9887ad93836e6bc0a5efc44a023e13920b19f2d8443bd95e73d8e1b5c0`. Its 5,190 files and 1,106 directories match the exact Git tree, including every file's size and SHA256. All 129 executable modes are preserved; ordinary files use DOS ZIP attributes without an explicit Unix 100644 mode.

Qualification evidence records 43 successful exact-main push workflows, 18 required workflow paths and 37 required check contexts. The current 130 trusted GitHub Actions checks had no adverse conclusion. Six original producer artifact listings independently bind final/reviewed JavaScript and Python scanner archives, compiler evidence and historical native compatibility evidence to their producer identities and digests.

JavaScript retains 42 raw findings and 42 complete reviewed slots: 34 false-positive dispositions and 8 nonsecurity quality acknowledgements. Independent reversible reference transport reconstructs the complete original scanner run and matches every reviewed slot. Python retains 0 raw findings, 79 extracted files, 172 query rule IDs and 8 required extracted files. Exact source profile bytes and frozen historical configuration/findings/original archive hashes were verified.

## Evidence scope and limits

The reports preserve their original bytes and hashes. `reports/independent-custody-report.json` references a full publisher log by hash; that large duplicate is omitted here. Original SARIF, full provenance, source profile and evidence ZIP bytes remain available as the release assets whose actual bytes were independently verified. Scanner producer log excerpts are included.

Direct code-scanning analysis API reads were unsupported by the connector. Embedded service receipt archives, original producer artifact metadata, raw SARIF hashes and producer upload-complete log evidence were verified. Retained service analysis rows remain authenticated publisher observations rather than a fresh independent service API read.

The source profile preserves its authoring marker `PENDING_FINAL_SOURCE_MAIN_PUSH`; completed exact-source qualification is separately recorded by publisher attempt 2 and the published provenance. Compiler/native/scanner tests were not rerun during custody verification.

This is qualified rc17 source evidence. It does not qualify local rc18, installed four-repository execution, or production operation. Historical native evidence retains its source/free-inspection compatibility boundary. No wallet, settlement, activation, signing or funding authority is established.

Browser evidence is supplied separately by the root publisher. This packet makes no screenshot-attachment claim.

## Packet verification

`MANIFEST.json` records each payload file's exact byte count, SHA256 and Git blob SHA1 identity, computed as SHA1(`blob <byte-count>\0<bytes>`). Its entries exclude `MANIFEST.json` and the packet's root `SHA256SUMS.txt` to avoid self-reference. Root `SHA256SUMS.txt` covers every payload file plus `MANIFEST.json`, excluding itself. All files are intended as Git 100644 blobs. The root publisher may add a separate browser report; that addition requires its own manifest entry/checksum update or a separate manifest.
