import test from 'node:test';
import assert from 'node:assert/strict';

import { formatError, FRIENDLY_ERROR_RULES } from '../lib.mjs';

test('friendly error catalogue exposes at least 20 rules', () => {
  assert.ok(
    FRIENDLY_ERROR_RULES.length >= 20,
    `expected 20+ error rules, received ${FRIENDLY_ERROR_RULES.length}`
  );
});

const RULE_EXPECTATIONS = [
  {
    id: 'insufficient_balance',
    error: () => new Error('execution reverted: insufficient balance'),
    expected:
      'You need more AGIALPHA available to cover the reward and stake. Tip: Top up or adjust the amounts.',
  },
  {
    id: 'insufficient_allowance',
    error: () => new Error('transfer amount exceeds allowance'),
    expected:
      'Escrow allowance is missing. Tip: Approve AGIALPHA spending from your wallet so I can move the staked funds for you.',
  },
  {
    id: 'reward_zero',
    error: () => new Error('reward must be greater than zero'),
    expected: 'Rewards must be greater than zero AGIALPHA. Tip: Set a positive reward before posting the job.',
  },
  {
    id: 'deadline_invalid',
    error: () => new Error('deadline is in the past'),
    expected: 'The deadline needs to be at least one day in the future. Tip: Pick a deadline that is 24 hours or more from now.',
  },
  {
    id: 'deadline_not_reached',
    error: () => new Error('deadline not reached'),
    expected:
      'That step isn’t available until the job deadline passes. Tip: Wait until the deadline or adjust the schedule before retrying.',
  },
  {
    id: 'job_not_found',
    error: () => new Error('job not found'),
    expected: 'I couldn’t find that job id on-chain. Tip: Check the job number or ask me for your recent jobs.',
  },
  {
    id: 'role_employer_only',
    error: () => new Error('notemployer'),
    expected: 'Only the employer can complete that action. Tip: Sign in with the employer account or ask me to switch roles.',
  },
  {
    id: 'role_validator_only',
    error: () => new Error('validatorbanned'),
    expected:
      'This action is limited to assigned validators. Tip: Ensure your validator ENS is registered and selected for the job.',
  },
  {
    id: 'role_operator_only',
    error: () => new Error('notoperator'),
    expected:
      'Only the job operator can run that step. Tip: Have the operator account confirm the action or ask for a reassignment.',
  },
  {
    id: 'role_governance_only',
    error: () => new Error('notgovernance'),
    expected:
      'Governance approval is required for this operation. Tip: Reach out to the governance team or use an approved governance key.',
  },
  {
    id: 'identity_required',
    error: () => new Error('identity verification required'),
    expected:
      'Identity verification is required before continuing. Tip: Finish identity verification in the Agent Gateway before using this one-box flow.',
  },
  {
    id: 'stake_missing',
    error: () => new Error('stake required'),
    expected: 'Stake the minimum AGIALPHA before continuing. Tip: Add funds or reduce the job’s stake size.',
  },
  {
    id: 'stake_too_high',
    error: () => new Error('stakeoverflow'),
    expected:
      'The requested stake exceeds the allowed maximum. Tip: Lower the stake amount or split it into smaller deposits.',
  },
  {
    id: 'aa_paymaster_rejected',
    error: () => new Error('paymaster rejected the request'),
    expected:
      'The account abstraction paymaster rejected this request. Tip: Retry shortly or submit the transaction manually.',
  },
  {
    id: 'invalid_state',
    error: () => new Error('invalidstate'),
    expected:
      'The job isn’t in the right state for that action yet. Tip: Check the job status and try the step that matches the current phase.',
  },
  {
    id: 'already_done',
    error: () => new Error('already applied'),
    expected: 'This step has already been completed. Tip: No further action is needed unless circumstances change.',
  },
  {
    id: 'burn_evidence_missing',
    error: () => new Error('burnreceipt missing'),
    expected:
      'Burn evidence is missing or incomplete. Tip: Upload the burn receipt or wait for the validator to finish the burn.',
  },
  {
    id: 'validator_window_closed',
    error: () => new Error('commitphaseclosed'),
    expected: 'The validation window has already closed. Tip: Wait for the next cycle or escalate through disputes if needed.',
  },
  {
    id: 'validator_window_open',
    error: () => new Error('validation timeout exceeded'),
    expected: 'Validator checks didn’t finish in time. Tip: Retry in a moment or contact support if it keeps failing.',
  },
  {
    id: 'dispute_open',
    error: () => new Error('dispute is already open'),
    expected: 'A dispute is already open for this job. Tip: Wait for resolution before taking further action.',
  },
  {
    id: 'network_fetch',
    error: () => new Error('TypeError: Failed to fetch'),
    expected: 'I couldn’t reach the orchestrator network. Tip: Check your internet connection or try again in a few seconds.',
  },
  {
    id: 'timeout',
    error: () => new Error('rpc timed out waiting for response'),
    expected: 'The blockchain RPC endpoint timed out. Tip: Try again or switch to a healthier provider.',
  },
  {
    id: 'rate_limited',
    error: () => {
      const err = new Error('Too Many Requests');
      err.status = 429;
      return err;
    },
    expected: 'You’re sending requests too quickly. Tip: Pause for a few seconds before trying again.',
  },
  {
    id: 'service_unavailable',
    error: () => {
      const err = new Error('Relayer is not configured');
      err.status = 503;
      return err;
    },
    expected: 'The relayer is offline right now. Tip: Switch to wallet mode or retry shortly.',
  },
  {
    id: 'unauthorized',
    error: () => {
      const err = new Error('unauthorized');
      err.status = 401;
      return err;
    },
    expected: 'The orchestrator rejected our credentials. Tip: Check that your API token is correct and hasn’t expired.',
  },
  {
    id: 'not_found',
    error: () => {
      const err = new Error('not found');
      err.status = 404;
      return err;
    },
    expected: 'The orchestrator endpoint was not found. Tip: Verify the /onebox URLs in your configuration.',
  },
  {
    id: 'user_rejected',
    error: () => {
      const err = new Error('user rejected the request');
      err.code = 'ACTION_REJECTED';
      return err;
    },
    expected: 'You cancelled the wallet prompt. Tip: Restart the request and approve it when you’re ready.',
  },
  {
    id: 'gas_estimation',
    error: () => {
      const err = new Error('cannot estimate gas');
      err.code = 'UNPREDICTABLE_GAS_LIMIT';
      return err;
    },
    expected:
      'I couldn’t estimate the gas for that transaction. Tip: Double-check the inputs or try again with slightly different parameters.',
  },
  {
    id: 'invalid_argument',
    error: () => {
      const err = new Error('invalid argument');
      err.code = 'INVALID_ARGUMENT';
      return err;
    },
    expected:
      'One of the inputs looks invalid. Tip: Use plain numbers for amounts and ensure addresses or ENS names are correct.',
  },
  {
    id: 'json_parse',
    error: () => new Error('Unexpected token < in JSON at position 0'),
    expected:
      'The orchestrator returned data in an unexpected format. Tip: Reload the page or retry—this can happen during upgrades.',
  },
  {
    id: 'quota_exceeded',
    error: () => new Error('quota exceeded spend cap'),
    expected: 'This action exceeds the configured spend cap. Tip: Reduce the reward or wait until the orchestrator refreshes its quota.',
  },
  {
    id: 'attachment_missing',
    error: () => new Error('attachment required'),
    expected:
      'Required attachments were missing from the request. Tip: Re-upload the files or drop them into the chat before confirming.',
  },
  {
    id: 'cid_mismatch',
    error: () => new Error('cid didn’t match record'),
    expected: 'The deliverable CID didn’t match what’s on record. Tip: Re-upload the correct artifact and try again.',
  },
  {
    id: 'ipfs_failure',
    error: () => new Error('IPFS upload failed'),
    expected: 'I couldn’t package your job details. Tip: Remove broken links and try again.',
  },
  {
    id: 'simulation_failed',
    error: () => new Error('simulation failed'),
    expected:
      'Simulation failed before submission. Tip: Review the planner output or switch to Expert Mode for a detailed trace.',
  },
  {
    id: 'unknown_revert',
    error: () => new Error('unknown revert occurred'),
    expected: 'The transaction reverted without a known reason. Tip: Check the logs or retry with adjusted parameters.',
  },
];

test('friendly error rules surface expected guidance', () => {
  for (const { id, error, expected } of RULE_EXPECTATIONS) {
    const actual = formatError(error());
    assert.equal(actual, expected, `rule ${id} did not render expected guidance`);
  }
});

test('fallback preserves original message when no rule matches', () => {
  const err = new Error('Subtle custom orchestrator error');
  const message = formatError(err);
  assert.equal(message, 'Subtle custom orchestrator error');
});
