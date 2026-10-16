# Initiative Evidence Studio

An original, browser-only EN/FR companion to the bounded Python ledger. No server, provider, wallet or third-party font is required. The existing narrative and diagrams are unchanged.

## Build and serve

```sh
node scripts/pages/empowerment-build.mjs
python3 -m http.server 8080 --bind 127.0.0.1 --directory build/empowerment
```

Open the local URL and choose **Verify CLI example**. The four files under `cli-example/` are exact outputs of the reviewed Python runtime, not independently created browser expectations. The page must show artifact verification passed and one of three initiatives ready for human review. French is available using the language button or `?lang=fr`.

## Bring your Python run into the browser

```sh
node scripts/pages/empowerment-bundle.mjs /tmp/initiative-evidence-run /tmp/initiative-evidence-bundle.json
```

This checks the run and creates a new lossless base64 envelope without overwriting an existing file. Use **Import exact-byte artifact bundle** in the page. The browser recomputes all results, verifies the receipt and compares original artifact bytes. A matching hash does not authenticate a source. Fully replaced self-consistent input remains acceptable and explicitly unverified in origin.

Packet, ledger and report exports preserve original bytes. CRLF imported packets are preserved until edited, even though textarea rendering normalizes line breaks. Editing invalidates results immediately. A stale asynchronous file import cannot replace a newer edit or action. Recovery uses the same full review, including after reload; browser storage failures leave export available and are disclosed.

Limits mirror the runtime: 256 KiB per artifact; 30 initiatives and sources; 16 KiB per observation; exact lexical integers 0–1,000,000,000. UTF-8 decoding is fatal and BOMs, duplicate fields and noninteger tokens are rejected. The transport envelope has a separate 1,500,000-byte cap so all four bounded artifacts can roundtrip without truncation.

## Focused verification

```sh
node --test test/pages/empowerment.test.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/official/headless_shell node scripts/pages/empowerment-browser-qa.mjs
```

The Node suite invokes the actual Python evaluator and compares exact artifact bytes across valid, invalid and boundary inputs. Browser QA exercises actual CLI artifacts, EN/FR accessibility, 390px reflow, 200% zoom, keyboard activation, byte-exact CRLF export, bundle recovery and reload, tampered/resealed output rejection, replaced supplied evidence, UTF-8/BOM rejection, stale file imports and forgetting a saved session. Reports and screenshots are emitted under `reports/pages/empowerment/`.

A successful review is same-evaluator recomputation. It never establishes source authenticity, real-world impact, independent human approval or permission to settle.
