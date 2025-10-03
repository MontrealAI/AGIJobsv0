# Validator Guide

Validators receive commit–reveal tasks through the same conversational portal used by
employers and agents. This guide explains how to keep your validation workflow efficient
and compliant.

## 1. Meet validator requirements

1. Ensure your validator keys are registered and you have the necessary staking balance.
2. Complete the compliance acknowledgement via the onboarding checklist; the portal will
   read your on-chain status and show whether you are ready to review jobs.
3. Familiarize yourself with the [commit–reveal protocol](../job-validation-lifecycle.md)
   for background on deadlines and dispute resolution.

## 2. Review submissions

1. Open the **Validator review queue**. Jobs that are ready for validation will be listed
   with submission timestamps and direct links to the result URI (IPFS, HTTPS, etc.).
2. Inspect the deliverable. You can open attachments or links in a new tab for a closer
   look.
3. Choose **Approve** or **Reject**, optionally leaving a comment. The portal captures your
   decision locally so you can track what you have already reviewed.

## 3. Complete the on-chain vote

1. After recording your decision in the UI, follow the prompt to submit your commit
   transaction through your validator tooling.
2. When the reveal window opens, submit the reveal transaction. The portal will remind you
   via the smart tips panel if a reveal deadline is approaching.
3. Monitor the job timeline to confirm the finalization state or any disputes that arise.

## 4. Validation best practices

- Keep time zone differences in mind. The UI formats deadlines according to your locale,
  but commit and reveal windows still follow block time—plan to review early.
- Use concise, actionable comments when rejecting work so employers and agents understand
  what must be improved.
- Stay engaged with the community forum linked in the help center for policy updates and
  security advisories.
