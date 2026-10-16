'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ethers = require('ethers');
const {
  validateCreationTraces,
} = require('../../scripts/verification/trace-evidence.cjs');
const { opcodeFixture } = require('./trace-fixtures.cjs');
const address = (n) => '0x' + n.toString(16).padStart(40, '0');
function fixture() {
  const frame = (type, from, to, extra = {}) => ({
    type,
    from,
    to,
    input: '0x6000',
    output: '0x6001',
    gas: '0x100000',
    gasUsed: '0x100',
    ...extra,
  });
  const nestedAddress = ethers.getCreate2Address(
    address(6),
    ethers.ZeroHash,
    ethers.keccak256('0x6000')
  );
  const callTrace = frame('CALL', address(1), address(2), {
    calls: [
      frame('CALL', address(2), address(3), {
        error: 'execution reverted',
        calls: [frame('CREATE', address(3), address(4))],
      }),
      frame('CREATE2', address(2), undefined, { error: 'execution reverted' }),
      frame('CREATE', address(2), address(6), {
        calls: [frame('CREATE2', address(6), nestedAddress)],
      }),
    ],
  });
  return {
    callTrace,
    opcodeTrace: opcodeFixture(callTrace),
    transaction: { from: address(1), to: address(2), data: '0x6000' },
    receipt: { status: 1, contractAddress: null },
    nestedAddress,
  };
}
const locate = (f, op, depth) =>
  f.opcodeTrace.structLogs.findIndex((l) => l.op === op && l.depth === depth);
const mutateFails = (mutations) => {
  for (const [name, mutate] of Object.entries(mutations)) {
    const f = fixture();
    mutate(f);
    assert.throws(() => validateCreationTraces(f), undefined, name);
  }
};
test('nested CREATE/CREATE2 outcomes, resumed addresses and reverted ancestry agree; only retained creations survive', () => {
  const f = fixture();
  assert.deepEqual(
    validateCreationTraces(f)
      .map((c) => c.address)
      .sort(),
    [address(6), f.nestedAddress].sort()
  );
});
test('missing/default/unknown/truncated/malformed call evidence fails closed', () =>
  mutateFails({
    empty: (f) => (f.callTrace = {}),
    default: (f) => (f.callTrace = { structLogs: [] }),
    unknown: (f) => (f.callTrace.type = 'UNKNOWN'),
    sender: (f) => delete f.callTrace.from,
    gas: (f) => delete f.callTrace.gasUsed,
    children: (f) => (f.callTrace.calls = {}),
    input: (f) => (f.callTrace.input = '0x1234'),
    target: (f) => (f.callTrace.to = address(999)),
    truncated: (f) => (f.callTrace.truncated = true),
    timeout: (f) => (f.callTrace.timeout = true),
    childInput: (f) => delete f.callTrace.calls[0].input,
    childType: (f) => (f.callTrace.calls[0].type = 'UNKNOWN'),
    childOutput: (f) => (f.callTrace.calls[0].calls[0].output = 'broken'),
    error: (f) => (f.callTrace.calls[0].error = ''),
    omittedChild: (f) => f.callTrace.calls.splice(0, 1),
    omittedChildren: (f) => delete f.callTrace.calls,
  }));
test('opcode schema requires complete stack and memory with bounded words and finished execution', () =>
  mutateFails({
    missing: (f) => (f.opcodeTrace = undefined),
    empty: (f) => (f.opcodeTrace = {}),
    failed: (f) => (f.opcodeTrace.failed = true),
    noLogs: (f) => (f.opcodeTrace.structLogs = []),
    logsType: (f) => (f.opcodeTrace.structLogs = {}),
    gas: (f) => delete f.opcodeTrace.gas,
    truncated: (f) => (f.opcodeTrace.truncated = true),
    timeout: (f) => (f.opcodeTrace.timeout = true),
    output: (f) => (f.opcodeTrace.returnValue = '00'),
    unfinished: (f) => f.opcodeTrace.structLogs.pop(),
    depth: (f) => delete f.opcodeTrace.structLogs[0].depth,
    noStack: (f) => delete f.opcodeTrace.structLogs[0].stack,
    badWord: (f) => (f.opcodeTrace.structLogs[0].stack = ['zz']),
    longWord: (f) => (f.opcodeTrace.structLogs[0].stack = ['1'.repeat(65)]),
    disabledMemory: (f) => {
      for (const log of f.opcodeTrace.structLogs) delete log.memory;
    },
    noMemory: (f) =>
      delete f.opcodeTrace.structLogs.find((l) => l.memory?.length).memory,
    badMemory: (f) => (f.opcodeTrace.structLogs[0].memory = ['00']),
    exception: (f) => (f.opcodeTrace.structLogs[0].error = 'out of gas'),
  }));
test('depth/context/order/entry/resumption invariants reject structurally impossible evidence', () =>
  mutateFails({
    jump: (f) => (f.opcodeTrace.structLogs[locate(f, 'RETURN', 3)].depth = 9),
    root: (f) => (f.opcodeTrace.structLogs[0].depth = 2),
    entry: (f) => (f.opcodeTrace.structLogs[locate(f, 'CALL', 1) + 1].pc = 9),
    childSender: (f) => (f.callTrace.calls[0].from = address(999)),
    childOrder: (f) => f.callTrace.calls.reverse(),
    missingCall: (f) =>
      f.opcodeTrace.structLogs.splice(locate(f, 'CALL', 1), 1),
    trailing: (f) =>
      f.opcodeTrace.structLogs.push({ ...f.opcodeTrace.structLogs.at(-1) }),
    resumePc: (f) => f.opcodeTrace.structLogs[locate(f, 'REVERT', 2) + 1].pc++,
    pc: (f) => f.opcodeTrace.structLogs[1].pc++,
    stackEffect: (f) => (f.opcodeTrace.structLogs[1].stack = []),
    unsupported: (f) => (f.opcodeTrace.structLogs[0].op = 'FUTUREOP'),
    resumePrefix: (f) =>
      f.opcodeTrace.structLogs[locate(f, 'RETURN', 3) + 1].stack.unshift('00'),
  }));
test('child error/terminal/output and parent result/address contradictions cannot hide a creation', () =>
  mutateFails({
    falseChildError: (f) => (f.callTrace.calls[2].error = 'execution reverted'),
    falseAncestorError: (f) => (f.callTrace.calls[0].error = undefined),
    falseChildSuccess: (f) => (f.callTrace.calls[1].error = undefined),
    falseReturn: (f) =>
      (f.opcodeTrace.structLogs[locate(f, 'REVERT', 2)].op = 'RETURN'),
    falseResult: (f) =>
      (f.opcodeTrace.structLogs[locate(f, 'RETURN', 3) + 1].stack = ['0']),
    falseAddress: (f) => (f.callTrace.calls[0].calls[0].to = address(999)),
    falseCallResult: (f) =>
      (f.opcodeTrace.structLogs[locate(f, 'REVERT', 2) + 1].stack = ['1']),
    input: (f) => (f.callTrace.calls[2].input = '0x6002'),
    output: (f) => (f.callTrace.calls[2].output = '0x6002'),
    create2Salt: (f) => {
      const l = f.opcodeTrace.structLogs.find(
        (l) => l.op === 'CREATE2' && l.depth === 2
      );
      l.stack[l.stack.length - 4] = '1';
    },
  }));
test('unsupported no-entry and ambiguous code-deposit failure evidence is rejected, without fallback', () => {
  const f = fixture();
  const at = locate(f, 'CREATE', 2),
    end = locate(f, 'RETURN', 3);
  f.opcodeTrace.structLogs.splice(at + 1, end - at);
  assert.throws(() => validateCreationTraces(f), /no-entry/);
  const g = fixture();
  g.callTrace.calls[2].error = 'contract creation code storage out of gas';
  assert.throws(() => validateCreationTraces(g), /outcome/);
});
test('root CREATE is distinct from internal opcodes and empty-code roots require independent evidence', () => {
  const f = fixture();
  f.transaction.to = null;
  f.receipt.contractAddress = address(2);
  f.callTrace.type = 'CREATE';
  assert(validateCreationTraces(f).some((c) => c.address === address(2)));
  const g = fixture();
  g.callTrace.calls = [];
  g.callTrace.output = '0x';
  g.opcodeTrace.returnValue = '';
  g.opcodeTrace.structLogs = [];
  assert.throws(() => validateCreationTraces(g), /Empty opcode/);
  assert.deepEqual(validateCreationTraces({ ...g, emptyCodeCall: true }), []);
});

test('delegate execution retains the caller storage context for descendant creation', () => {
  const f = fixture();
  f.callTrace.calls = [
    {
      type: 'DELEGATECALL',
      from: address(2),
      to: address(9),
      input: '0x1234',
      output: '0x',
      gas: '0x10000',
      gasUsed: '0x100',
      calls: [
        {
          type: 'CREATE',
          from: address(2),
          to: address(10),
          input: '0x6000',
          output: '0x00',
          gas: '0x10000',
          gasUsed: '0x100',
        },
      ],
    },
  ];
  f.opcodeTrace = opcodeFixture(f.callTrace);
  assert.deepEqual(
    validateCreationTraces(f).map((c) => c.address),
    [address(10)]
  );
  f.callTrace.calls[0].calls[0].from = address(9);
  assert.throws(() => validateCreationTraces(f), /context/);
});
