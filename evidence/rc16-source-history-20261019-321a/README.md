# rc16 source-history archive

This branch preserves actual Git objects for the reviewed local source without making this archive a final-source ancestor.

- Local reviewed commit: `1d94da02724e450429420ceea85bf2467a3a8990`.
- Public source proposal: [fb177b15adfb77de8ae697261797410cd11ac6f3](https://github.com/MontrealAI/AGIJobsv0/commit/fb177b15adfb77de8ae697261797410cd11ac6f3).
- Both source trees are exactly `dbb1dd08db3c2dc8ad87a890d6fa1f4d97a0a772`.
- The public source has ordered parents `bfeab08248753287e83d287b898f399c94174b1c` and `8f11b17f6025834377f0fbe6d675e68dccd572ab`.

`history.bundle` retains the 16 actual unpublished commits, including their original authors, timestamps, trees and parent edges. Its SHA256 is `d9003a85d2c95a0865131094024f2fdcc95cd75da484e98497e91532e4b2a1d1` (49,178 bytes). `mapping.json` records its public prerequisites, exact source mapping and audit scope. The audit covers 126 objects and 47 UTF-8 source/test/workflow/metadata blob versions; it found no unexpected sensitive-payload path or credential marker. No runtime journal, key or environment-file payload is archived.

The ordinary Git push was unavailable because it could not authenticate. The connector therefore created a new source commit identity; the public SHA is not represented as the original local SHA. Both actual scanner review slots remain null. This archive is not scanner, Advanced Security, release or installed qualification.

Do not merge this evidence branch into the product source. Use the source proposal branch for normal source review/adoption. Restoring a bundle is a separate source-control operation requiring its public prerequisite objects; it does not execute product code.
