# LAUNCH_PLAN_TEMPLATE.md — AGIJobs v2 One‑Pager

> **Purpose:** Single‑page plan for a v2 deployment/change, attached to the Safe proposal for review & approval.

---

## 1) Summary
- **Action:** <Deploy v2 | Param update | Upgrade>
- **Environment:** <mainnet | sepolia | holesky>
- **Target date/time (UTC):** <YYYY-MM-DD HH:MM>
- **Owner (Safe):** <0x...> (threshold <e.g., 2-of-3>)
- **Relayer (Defender):** <name/id>
- **Change window:** <duration>

## 2) Scope
- **In scope:** <modules/contracts/parameters>
- **Out of scope:** <what will NOT change>
- **Dependencies:** <$AGIALPHA token, ENS, oracles, subgraph, frontends>

## 3) Parameters (to set at T0)
- **Fee %:** <e.g., 2%>
- **Burn %:** <e.g., 50% of fees>
- **Treasury:** <0x... or “unset”> (must be allowlisted first)
- **Allowlist additions:** <addresses + rationale>
- **Operators/Oracles:** <addresses + roles>
- **Pause state at launch:** <paused/unpaused per module>

## 4) Addresses & artifacts (post‑deploy to fill)
- **StakeManager:** <0x...> (tx <0x...>)
- **ReputationEngine:** <0x...> (tx <0x...>)
- **IdentityRegistry:** <0x...> (tx <0x...>)
- **ValidationModule:** <0x...> (tx <0x...>)
- **DisputeModule:** <0x...> (tx <0x...>)
- **CertificateNFT:** <0x...> (tx <0x...>)
- **JobRegistry:** <0x...> (tx <0x...>)
- **FeePool (if separate):** <0x...> (tx <0x...>)

## 5) Approvals & signers
- **Reviewers:** <names/roles>
- **Approvers (Safe signers):** <list>
- **Quorum check:** Threshold met? <Yes/No>

## 6) Pre‑flight checks (attach evidence)
- ✅ `npm run compile` & `npm test`
- ✅ `npm run verify:agialpha -- --skip-onchain` matches `$AGIALPHA` (`0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`)
- ✅ `npm run owner:health` clean
- ✅ `npm run owner:plan` reviewed
- ✅ Testnet rehearsal completed; links: <Safe tx / explorer>

## 7) Step‑by‑step (execution)
1. Create Defender **Deploy Proposal** for v2 suite, target <network>.
2. Approve via **Safe** (threshold).
3. Verify contracts on explorer (proxy + impl).
4. Execute **initialization** transactions via Safe:
   - Set fee/burn %, set treasury (if allowlisted)
   - Register operators/oracles
   - Unpause when ready
5. Run **smoke test** job; confirm events, balances, and subgraph updates.
6. Publish **DEPLOYED_ADDRESSES.md** and announce readiness.

## 8) Rollback / break‑glass
- **Immediate:** Pause affected modules via Safe.
- **Containment:** Restrict to emergency allowlists if needed.
- **Recovery:** Prepare forward fix (new params/upgrade), route via normal Safe process.
- **Comms:** Short public note with Safe tx links and current status.

## 9) Communications
- **Stakeholder list:** <names/channels>
- **Announcements:** <where/when>
- **Point of contact (on‑call):** <name/handle>

## 10) Sign‑off
- **Technical owner:** <name, date, signature>
- **Product/governance:** <name, date, signature>
- **Security:** <name, date, signature>
