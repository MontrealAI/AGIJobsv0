import {
  afterEach,
  assert,
  beforeEach,
  clearStore,
  describe,
  newMockEvent,
  test,
} from 'matchstick-as/assembly/index';
import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts';

import {
  handleJobCreated,
  handleJobFinalized,
  handleStakeDeposited,
  handleStakeSlashed,
  handleValidatorVoted,
} from '../src/mapping';
import { JobCreated, JobFinalized } from '../generated/JobRegistry/JobRegistry';
import {
  StakeDeposited,
  StakeSlashed,
} from '../generated/StakeManager/StakeManager';
import { ValidationRevealed } from '../generated/ValidationModule/ValidationModule';

const JOB_REGISTRY = Address.fromString(
  '0x5FbDB2315678afecb367f032d93F642f64180aa3'
);
const STAKE_MANAGER = Address.fromString(
  '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
);
const VALIDATION_MODULE = Address.fromString(
  '0x9fE46736679d2D9a65F0992F2272De9f3c7Fa6e0'
);

function createJobCreatedEvent(
  jobId: i32,
  employer: Address,
  agent: Address,
  reward: i32,
  stake: i32,
  fee: i32,
  specHash: Bytes,
  uri: string,
  blockNumber: i32
): JobCreated {
  const mock = changetype<JobCreated>(newMockEvent());
  mock.address = JOB_REGISTRY;
  mock.block.number = BigInt.fromI32(blockNumber);
  mock.block.timestamp = BigInt.fromI32(blockNumber * 13);
  mock.transaction.hash = Bytes.fromHexString(
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ) as Bytes;
  mock.logIndex = BigInt.fromI32(blockNumber);
  mock.parameters = new Array();
  mock.parameters.push(
    new ethereum.EventParam(
      'jobId',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(jobId))
    )
  );
  mock.parameters.push(
    new ethereum.EventParam('employer', ethereum.Value.fromAddress(employer))
  );
  mock.parameters.push(
    new ethereum.EventParam('agent', ethereum.Value.fromAddress(agent))
  );
  mock.parameters.push(
    new ethereum.EventParam(
      'reward',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(reward))
    )
  );
  mock.parameters.push(
    new ethereum.EventParam(
      'stake',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(stake))
    )
  );
  mock.parameters.push(
    new ethereum.EventParam(
      'fee',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(fee))
    )
  );
  mock.parameters.push(
    new ethereum.EventParam('specHash', ethereum.Value.fromFixedBytes(specHash))
  );
  mock.parameters.push(
    new ethereum.EventParam('uri', ethereum.Value.fromString(uri))
  );
  return mock;
}

function createJobFinalizedEvent(
  jobId: i32,
  worker: Address,
  blockNumber: i32
): JobFinalized {
  const mock = changetype<JobFinalized>(newMockEvent());
  mock.address = JOB_REGISTRY;
  mock.block.number = BigInt.fromI32(blockNumber);
  mock.block.timestamp = BigInt.fromI32(blockNumber * 13);
  mock.transaction.hash = Bytes.fromHexString(
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  ) as Bytes;
  mock.logIndex = BigInt.fromI32(blockNumber);
  mock.parameters = new Array();
  mock.parameters.push(
    new ethereum.EventParam(
      'jobId',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(jobId))
    )
  );
  mock.parameters.push(
    new ethereum.EventParam('worker', ethereum.Value.fromAddress(worker))
  );
  return mock;
}

function createStakeDepositedEvent(
  user: Address,
  role: i32,
  amount: i32,
  blockNumber: i32
): StakeDeposited {
  const mock = changetype<StakeDeposited>(newMockEvent());
  mock.address = STAKE_MANAGER;
  mock.block.number = BigInt.fromI32(blockNumber);
  mock.block.timestamp = BigInt.fromI32(blockNumber * 13);
  mock.transaction.hash = Bytes.fromHexString(
    '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
  ) as Bytes;
  mock.logIndex = BigInt.fromI32(blockNumber);
  mock.parameters = new Array();
  mock.parameters.push(
    new ethereum.EventParam('user', ethereum.Value.fromAddress(user))
  );
  mock.parameters.push(
    new ethereum.EventParam(
      'role',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(role))
    )
  );
  mock.parameters.push(
    new ethereum.EventParam(
      'amount',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(amount))
    )
  );
  return mock;
}

function createStakeSlashedEvent(
  user: Address,
  role: i32,
  employer: Address,
  treasury: Address,
  employerShare: i32,
  treasuryShare: i32,
  burnShare: i32,
  blockNumber: i32
): StakeSlashed {
  const mock = changetype<StakeSlashed>(newMockEvent());
  mock.address = STAKE_MANAGER;
  mock.block.number = BigInt.fromI32(blockNumber);
  mock.block.timestamp = BigInt.fromI32(blockNumber * 13);
  mock.transaction.hash = Bytes.fromHexString(
    '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
  ) as Bytes;
  mock.logIndex = BigInt.fromI32(blockNumber);
  mock.parameters = new Array();
  mock.parameters.push(
    new ethereum.EventParam('user', ethereum.Value.fromAddress(user))
  );
  mock.parameters.push(
    new ethereum.EventParam(
      'role',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(role))
    )
  );
  mock.parameters.push(
    new ethereum.EventParam('employer', ethereum.Value.fromAddress(employer))
  );
  mock.parameters.push(
    new ethereum.EventParam('treasury', ethereum.Value.fromAddress(treasury))
  );
  mock.parameters.push(
    new ethereum.EventParam(
      'employerShare',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(employerShare))
    )
  );
  mock.parameters.push(
    new ethereum.EventParam(
      'treasuryShare',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(treasuryShare))
    )
  );
  mock.parameters.push(
    new ethereum.EventParam(
      'burnShare',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(burnShare))
    )
  );
  return mock;
}

function createValidationRevealedEvent(
  jobId: i32,
  validator: Address,
  approve: bool,
  burnHash: Bytes,
  blockNumber: i32
): ValidationRevealed {
  const mock = changetype<ValidationRevealed>(newMockEvent());
  mock.address = VALIDATION_MODULE;
  mock.block.number = BigInt.fromI32(blockNumber);
  mock.block.timestamp = BigInt.fromI32(blockNumber * 13);
  mock.transaction.hash = Bytes.fromHexString(
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  ) as Bytes;
  mock.logIndex = BigInt.fromI32(blockNumber);
  mock.parameters = new Array();
  mock.parameters.push(
    new ethereum.EventParam(
      'jobId',
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(jobId))
    )
  );
  mock.parameters.push(
    new ethereum.EventParam('validator', ethereum.Value.fromAddress(validator))
  );
  mock.parameters.push(
    new ethereum.EventParam('approve', ethereum.Value.fromBoolean(approve))
  );
  mock.parameters.push(
    new ethereum.EventParam(
      'burnTxHash',
      ethereum.Value.fromFixedBytes(burnHash)
    )
  );
  mock.parameters.push(
    new ethereum.EventParam('subdomain', ethereum.Value.fromString('validator'))
  );
  return mock;
}

describe('mapping handlers', () => {
  beforeEach(() => {
    clearStore();
  });

  afterEach(() => {
    clearStore();
  });

  test('job lifecycle updates protocol stats', () => {
    const jobEvent = createJobCreatedEvent(
      1,
      Address.fromString('0x00000000000000000000000000000000000000aa'),
      Address.fromString('0x00000000000000000000000000000000000000bb'),
      100,
      50,
      5,
      Bytes.fromHexString(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      ) as Bytes,
      'ipfs://job',
      1
    );
    handleJobCreated(jobEvent);

    assert.fieldEquals('Job', '1', 'state', 'Assigned');
    assert.fieldEquals('Job', '1', 'escrowed', '150');

    const finalizeEvent = createJobFinalizedEvent(
      1,
      Address.fromString('0x00000000000000000000000000000000000000cc'),
      10
    );
    handleJobFinalized(finalizeEvent);

    assert.fieldEquals('Job', '1', 'state', 'Finalized');
    assert.fieldEquals(
      'Job',
      '1',
      'assignedTo',
      '0x00000000000000000000000000000000000000cc'
    );
    assert.fieldEquals('ProtocolStats', 'agi-jobs', 'totalJobs', '1');
    assert.fieldEquals('ProtocolStats', 'agi-jobs', 'finalizedJobs', '1');
  });

  test('stake flows track balances and aggregates', () => {
    const user = Address.fromString(
      '0x00000000000000000000000000000000000000dd'
    );
    const deposit = createStakeDepositedEvent(user, 1, 200, 2);
    handleStakeDeposited(deposit);

    const stakeId = user.toHexString() + ':Validator';
    assert.fieldEquals('Stake', stakeId, 'currentBalance', '200');
    assert.fieldEquals('StakeAggregate', 'Validator', 'participantCount', '1');

    const slash = createStakeSlashedEvent(
      user,
      1,
      Address.zero(),
      Address.zero(),
      50,
      25,
      25,
      3
    );
    handleStakeSlashed(slash);

    assert.fieldEquals('Stake', stakeId, 'currentBalance', '100');
    assert.fieldEquals('StakeAggregate', 'Validator', 'currentBalance', '100');
    assert.fieldEquals('ProtocolStats', 'agi-jobs', 'totalSlashed', '100');
  });

  test('validator votes increment quorum and counters', () => {
    const jobEvent = createJobCreatedEvent(
      2,
      Address.fromString('0x00000000000000000000000000000000000000aa'),
      Address.zero(),
      10,
      5,
      1,
      Bytes.fromHexString(
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      ) as Bytes,
      'ipfs://vote',
      4
    );
    handleJobCreated(jobEvent);

    assert.fieldEquals('Job', '2', 'state', 'Open');

    const voter = Address.fromString(
      '0x00000000000000000000000000000000000000ee'
    );
    const stakeEvent = createStakeDepositedEvent(voter, 1, 300, 5);
    handleStakeDeposited(stakeEvent);

    const reveal = createValidationRevealedEvent(
      2,
      voter,
      true,
      Bytes.fromHexString(
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
      ) as Bytes,
      6
    );
    handleValidatorVoted(reveal);

    assert.fieldEquals('Job', '2', 'state', 'Validating');
    assert.fieldEquals('Job', '2', 'validatorQuorum', '1');
    assert.fieldEquals('Job', '2', 'approvals', '1');
    assert.fieldEquals('Validator', voter.toHexString(), 'totalVotes', '1');
    const voteId = '2:' + voter.toHexString();
    assert.fieldEquals('ValidatorVote', voteId, 'approved', 'true');
    assert.fieldEquals(
      'ValidatorVote',
      voteId,
      'txHash',
      reveal.transaction.hash.toHexString()
    );

    const changeVote = createValidationRevealedEvent(
      2,
      voter,
      false,
      Bytes.fromHexString(
        '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
      ) as Bytes,
      7
    );
    handleValidatorVoted(changeVote);

    assert.fieldEquals('Job', '2', 'validatorQuorum', '1');
    assert.fieldEquals('Job', '2', 'approvals', '0');
    assert.fieldEquals('Job', '2', 'rejections', '1');
    assert.fieldEquals('Validator', voter.toHexString(), 'totalVotes', '1');
    assert.fieldEquals('ProtocolStats', 'agi-jobs', 'totalValidatorVotes', '1');
    assert.fieldEquals('ValidatorVote', voteId, 'approved', 'false');
  });
});
