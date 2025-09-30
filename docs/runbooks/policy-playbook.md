# Sponsorship Policy Playbook

Use this playbook to design, approve, and roll out paymaster sponsorship policy changes.

## Stakeholders
- **Policy Owner** – defines eligibility rules and fee schedules.
- **Security Lead** – reviews abuse vectors.
- **Node Operator** – executes the change via the Operator Control Plane (OCP).

## Change Types
1. **Fee Adjustment** – Update flat and percentage fees.
2. **Eligibility Rule Change** – Modify allow/deny lists, schema requirements, or rate caps.
3. **Emergency Block** – Immediately stop a bad actor from consuming sponsorships.

## Workflow
1. **Proposal**
   - Document the change in Notion with expected impact metrics.
   - Capture baseline values for `service:sponsored_ops_total:rate5m` and rejection rate.
2. **Risk Review**
   - Security Lead validates against the threat model (see `docs/security/threat-model.md`).
   - Ensure KMS policies permit any new signers.
3. **Approval**
   - Gather sign-off from Policy Owner + Security Lead in OCP comments.
4. **Execution**
   - Node Operator applies the change in OCP under **Policy > Sponsorship Profile**.
   - Require WebAuthn + policy change multi-sig to complete.
5. **Verification**
   - Monitor Grafana dashboard (panels "Sponsored Operations Rate" and "Sponsorship Rejections by Result").
   - Acknowledge/close any Alertmanager notifications triggered during rollout.

## Emergency Block Procedure
1. Toggle the **Pause Sponsorships** switch (see Node Operator Runbook).
2. In OCP, add the offending smart wallet or schema UID to the deny list.
3. Resume sponsorships once metrics return to baseline.
4. File an incident review within 24 hours.

## Audit
- Export receipts for the affected period using the Receipts tab.
- Store audit logs in the compliance bucket for 7 years.

## Change Log
- v1.0 – Initial policy change workflow.
