# AGIJobsv0 Codebase Assessment & Production Sprint Plan

## 1. Token Economy & Burn Mechanism
- `$AGIALPHA` is the sole ERC‑20 token across the system and is hard‑coded into all modules.
- `FeePool.distributeFees` burns a configurable percentage of every fee via `IERC20Burnable.burn` and burns all fees if no stake exists.
- Constructors reject treasury addresses that equal the owner or are missing from an allowlist, preventing the platform from accumulating dust.

## 2. Employer‑Driven Burn Enforcement
- Employers must submit burn receipts and explicitly confirm burns before jobs can be finalized.
- Only the original employer (or governance) can finalize a job and must provide a burn confirmation when fees or burn rates apply.

## 3. Tax‑Policy Acknowledgement & Neutrality
- `TaxPolicy` stores disclaimer text/URI and records per‑address acknowledgements.
- `TaxAcknowledgement` library reverts if a caller has not acknowledged the current policy.
- Core modules expose `isTaxExempt()` returning `true` to signal perpetual tax neutrality.

## 4. Handling of Fees & Expired Stakes
- `FeePool` burns remaining fees when no stakers exist and only allows withdrawals to the burn address or an allow‑listed treasury via governance.
- `StakeManager._slash` splits slashed stakes between employer, treasury, and burn, with residual tokens destroyed.

## 5. Governance & Owner Controls
- Job finalization routes funds through `StakeManager.finalizeJobFunds`, allowing treasury redirection when agents or employers are blacklisted.
- Governance withdrawals are restricted to a `TimelockController`, guarding against unilateral owner access.
- `TaxPolicy` owner can bump policy versions, forcing users to re‑acknowledge.

## 6. ENS‑Based Identity Verification
- `IdentityRegistry` verifies agents/validators own ENS subdomains or are allow‑listed; reputation blacklisting blocks verification.
- Job applications call `verifyAgent`, caching authorization and requiring tax acknowledgement.

## 7. Staking, Slashing & Rewards
- `StakeManager` defines slashing percentages, redistributes employer and treasury shares, and burns residual tokens.
- Job finalization pays validators and agents, releases or slashes stakes, and updates reputation.

## 8. Documentation & Developer Workflow
- The master guide enumerates deployment prerequisites and confirms `$AGIALPHA` token details and burn policy.
- `tax-obligations.md` clarifies employers finalize jobs and burn their own tokens, keeping the platform tax‑exempt.

## 9. Sprint Plan Focus
- Verify token burnability & supply reduction; ensure `$AGIALPHA` burn is open to holders.
- Harden employer burn flow and document the Etherscan workflow.
- Integrate tax acknowledgement checks across entry points and require re‑acknowledgement on policy updates.
- Complete ENS identity enforcement with NameWrapper/Resolver fallbacks, allowlist mechanics, and event logging.
- Finalize staking & slashing parameters for rational incentives.
- Expand event coverage for job lifecycle, stake changes, and policy updates.
- Prepare deployment & user guides detailing contract wiring and participant workflows.

By executing this plan, AGIJobsv0 is positioned for a transparent, tax‑neutral, and governance‑ready launch of the first AGI labor marketplace.

