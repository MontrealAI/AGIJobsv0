# Enterprise portal

The portal guides employers through job creation, agents through available work, and validators through review. It uses the existing AGI Jobs contracts and wallet permissions. Configure the actual registry, tax-policy, identity, token and network addresses before using funded accounts; the default addresses are setup placeholders.

Use the repository's pinned Node/npm toolchain:

```bash
npm ci --prefix apps/enterprise-portal
npm --prefix apps/enterprise-portal run dev
```

## Publish a specification before funding a job

The structured form, conversational form and governance demo all require a real published specification. The conversational form presents these steps after the draft summary:

1. **Download exact specification.** Review the draft and download its JSON file. This file contains the precise bytes whose Keccak-256 hash is submitted to the contract.
2. **Publish the file.** Upload it unchanged to your operator-approved durable storage or IPFS pinning provider. Use a byte-preserving file upload: a JSON API that reorders keys or adds whitespace produces different bytes. Keep the file available for the complete job, review and dispute lifecycle.
3. **Paste and verify the URI.** Enter the actual `ipfs://<CID>/…` or approved HTTPS location. The portal downloads it, verifies the exact hash and shows the result. It performs a fresh verification again before requesting the wallet transaction. Changing the draft requires publishing its updated file.

The portal does not invent an IPFS location or provision a storage account. Missing content, mismatched bytes, forbidden destinations, redirects, oversized responses and timeouts stop before the wallet transaction. A displayed hash alone is not evidence that a file exists. The publication URI is separate from the document being hashed, avoiding a self-referential content-addressed file.

Selected attachment files remain on your device; the draft records their names, not their contents. Publish the referenced files separately and add an accessible reference link. Only publish material you are authorized to expose through the chosen storage path. The specification's integrity check does not independently validate every referenced attachment or guarantee the provider's future availability.

## Operator storage configuration

Build-time public settings:

| Setting | Default and purpose |
| --- | --- |
| `NEXT_PUBLIC_SPECIFICATION_GATEWAY` | `https://ipfs.io/ipfs`; gateway route used for IPFS retrieval. |
| `NEXT_PUBLIC_SPECIFICATION_ORIGINS` | JSON array `["https://ipfs.io", "https://w3s.link", "https://cloudflare-ipfs.com"]`; permitted retrieval origins. |

Match these settings to the orchestrator's `IPFS_GATEWAY_URL` and `ORCHESTRATOR_ARTIFACT_ORIGINS`. A custom gateway grants its configured path, not unrelated same-origin endpoints. Remote URLs require HTTPS; explicit literal-loopback HTTP is supported for local testing. URLs cannot contain credentials, query parameters or fragments.

The chosen service must return the file directly with browser CORS access for the portal origin. Requests omit credentials, reject redirects, bypass browser caches, time out after 15 seconds and limit responses to 4 MiB. Provider authentication and upload credentials belong in your external upload service or protected operator environment, never in a `NEXT_PUBLIC_*` variable or job metadata. No unprotected upload proxy is added to the portal.

## Verification

From the repository root:

```bash
npm --prefix apps/enterprise-portal run typecheck
npm run compile
npx --no-install tsc -p apps/enterprise-portal/tsconfig.test.json
node --test apps/enterprise-portal/dist-test/test/*.test.js
npm --prefix apps/enterprise-portal run build
npx playwright install chromium
node apps/enterprise-portal/test/publication-browser.cjs
```

The webapp workflow runs publication and signature regressions. The publication tests use a real isolated HTTP server and verify that invalid retrievals never reach the wallet callback. Fixture tests do not commission an external storage provider or a funded network.
