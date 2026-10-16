'use strict';
const ethers = require('ethers');
const { insist, lower } = require('./evidence.cjs');
const TYPES = new Set([
  'CALL',
  'STATICCALL',
  'DELEGATECALL',
  'CALLCODE',
  'CREATE',
  'CREATE2',
]);
const TERMINALS = new Set(['RETURN', 'REVERT', 'STOP', 'SELFDESTRUCT']);
const HEX = /^0x(?:[a-fA-F0-9]{2})*$/;
const WORD = /^(?:0x)?[a-fA-F0-9]{1,64}$/;
const MAX_MEMORY_BYTES = 16 * 1024 * 1024;
function quantity(value) {
  return (
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ||
    (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value))
  );
}
function bytes(value, label) {
  insist(typeof value === 'string' && HEX.test(value), `Malformed ${label}`);
  return lower(value);
}
function word(value) {
  insist(
    typeof value === 'string' && WORD.test(value),
    'Malformed opcode stack word'
  );
  return BigInt(value.startsWith('0x') ? value : '0x' + value);
}
function top(log, offset = 0) {
  insist(log.stack.length > offset, 'Opcode stack underflow');
  return word(log.stack[log.stack.length - 1 - offset]);
}
function memory(log, offset, length) {
  if (length === 0n) return '0x';
  insist(
    offset + length <= BigInt(MAX_MEMORY_BYTES),
    'Unsupported trace memory extent'
  );
  const data = (log.memory || [])
    .map((value) => value.replace(/^0x/, ''))
    .join('');
  const end = Number(offset + length) * 2;
  return (
    '0x' +
    data
      .padEnd(end, '0')
      .slice(Number(offset) * 2, end)
      .toLowerCase()
  );
}
// Geth omits memory only while its allocated size is zero. Track exact
// per-context expansion so omitted/truncated memory after allocation is rejected.
function expandedMemory(log, previous) {
  let size = BigInt(previous);
  function region(offset, length) {
    if (length === 0n) return;
    const end = ((offset + length + 31n) / 32n) * 32n;
    insist(end <= BigInt(MAX_MEMORY_BYTES), 'Unsupported trace memory extent');
    if (end > size) size = end;
  }
  const op = log.op;
  if (['MLOAD', 'MSTORE'].includes(op)) region(top(log), 32n);
  else if (op === 'MSTORE8') region(top(log), 1n);
  else if (
    ['RETURN', 'REVERT', 'SHA3', 'KECCAK256'].includes(op) ||
    /^LOG[0-4]$/.test(op)
  )
    region(top(log), top(log, 1));
  else if (['CREATE', 'CREATE2'].includes(op)) region(top(log, 1), top(log, 2));
  else if (['CALLDATACOPY', 'CODECOPY', 'RETURNDATACOPY'].includes(op))
    region(top(log), top(log, 2));
  else if (op === 'EXTCODECOPY') region(top(log, 1), top(log, 3));
  else if (op === 'MCOPY') {
    region(top(log), top(log, 2));
    region(top(log, 1), top(log, 2));
  } else if (['CALL', 'CALLCODE', 'STATICCALL', 'DELEGATECALL'].includes(op)) {
    const shift = ['CALL', 'CALLCODE'].includes(op) ? 1 : 0;
    region(top(log, 2 + shift), top(log, 3 + shift));
    region(top(log, 4 + shift), top(log, 5 + shift));
  }
  return Number(size);
}
// Supported opcode effects. We validate height and untouched stack prefixes,
// not re-execute arithmetic or cryptography. Unknown/future opcodes fail closed.
const EFFECTS = {};
function effects(names, consumed, produced) {
  for (const name of names.split(' ')) EFFECTS[name] = [consumed, produced];
}
effects(
  'ADD MUL SUB DIV SDIV MOD SMOD EXP SIGNEXTEND LT GT SLT SGT EQ AND OR XOR BYTE SHL SHR SAR',
  2,
  1
);
effects('ADDMOD MULMOD', 3, 1);
effects(
  'ISZERO NOT BALANCE CALLDATALOAD EXTCODESIZE EXTCODEHASH BLOCKHASH BLOBHASH MLOAD SLOAD TLOAD',
  1,
  1
);
effects('KECCAK256 SHA3', 2, 1);
effects(
  'ADDRESS ORIGIN CALLER CALLVALUE CALLDATASIZE CODESIZE GASPRICE RETURNDATASIZE COINBASE TIMESTAMP NUMBER PREVRANDAO DIFFICULTY GASLIMIT CHAINID SELFBALANCE BASEFEE BLOBBASEFEE PC MSIZE GAS',
  0,
  1
);
effects('CALLDATACOPY CODECOPY RETURNDATACOPY MCOPY', 3, 0);
effects('EXTCODECOPY', 4, 0);
effects('MSTORE MSTORE8 SSTORE TSTORE JUMPI', 2, 0);
effects('POP JUMP', 1, 0);
effects('JUMPDEST', 0, 0);
for (let n = 0; n <= 4; n++) EFFECTS[`LOG${n}`] = [2 + n, 0];
function advance(log, next) {
  insist(
    next && next.depth === log.depth,
    'Opcode context changed without call or terminal'
  );
  let expectedPc = log.pc + 1;
  let expected;
  const current = log.stack.map(word);
  const push = /^PUSH([0-9]+)$/.exec(log.op);
  const dup = /^DUP([0-9]+)$/.exec(log.op);
  const swap = /^SWAP([0-9]+)$/.exec(log.op);
  if (push) {
    const n = Number(push[1]);
    insist(n >= 0 && n <= 32, 'Unsupported PUSH opcode');
    expectedPc += n;
    expected = [...current, n === 0 ? 0n : null];
  } else if (dup) {
    const n = Number(dup[1]);
    insist(n >= 1 && n <= 16 && current.length >= n, 'Invalid DUP stack');
    expected = [...current, current[current.length - n]];
  } else if (swap) {
    const n = Number(swap[1]);
    insist(n >= 1 && n <= 16 && current.length > n, 'Invalid SWAP stack');
    expected = [...current];
    [expected[expected.length - 1], expected[expected.length - 1 - n]] = [
      expected[expected.length - 1 - n],
      expected[expected.length - 1],
    ];
  } else {
    const effect = EFFECTS[log.op];
    insist(
      effect && current.length >= effect[0],
      'Unsupported opcode or stack underflow'
    );
    expected = current
      .slice(0, current.length - effect[0])
      .concat(Array(effect[1]).fill(null));
    if (log.op === 'JUMP' || (log.op === 'JUMPI' && top(log, 1) !== 0n)) {
      insist(
        top(log) <= BigInt(Number.MAX_SAFE_INTEGER) && next.op === 'JUMPDEST',
        'Invalid jump destination'
      );
      expectedPc = Number(top(log));
    }
  }
  insist(next.pc === expectedPc, 'Opcode program counter transition mismatch');
  insist(
    next.stack.length === expected.length &&
      expected.every(
        (value, n) => value === null || value === word(next.stack[n])
      ),
    'Opcode stack transition mismatch'
  );
}
function isCreate(frame) {
  return frame.type === 'CREATE' || frame.type === 'CREATE2';
}
/** Supported subset: complete Geth callTracer plus stack/memory-enabled structLogs.
 * Every call attempt must have an explicit child, entered execution, a terminal,
 * and a resumed parent stack. Exceptional halts, code-deposit failures and
 * no-entry child calls fail closed rather than inferring an outcome. RPC honesty
 * is still trusted; independent real-client integration is required.
 */
function validateCreationTraces({
  callTrace,
  opcodeTrace,
  transaction,
  receipt,
  emptyCodeCall = false,
}) {
  insist(
    receipt && [1, '0x1'].includes(receipt.status),
    'Trace evidence requires a successful receipt'
  );
  const creations = [];
  function validateFrame(frame) {
    insist(
      frame && typeof frame === 'object' && !Array.isArray(frame),
      'Missing callTracer frame'
    );
    insist(
      TYPES.has(frame.type) && !('structLogs' in frame),
      'Missing or unsupported callTracer frame type'
    );
    insist(ethers.isAddress(frame.from), 'Missing callTracer frame sender');
    insist(
      quantity(frame.gas) && quantity(frame.gasUsed),
      'Missing callTracer execution gas evidence'
    );
    if (frame.error !== undefined)
      insist(
        typeof frame.error === 'string' && frame.error.length > 0,
        'Malformed callTracer error'
      );
    insist(
      ethers.isAddress(frame.to) ||
        (isCreate(frame) &&
          frame.error !== undefined &&
          frame.to === undefined),
      'Missing callTracer frame destination'
    );
    bytes(frame.input, 'callTracer input');
    if (frame.output !== undefined) bytes(frame.output, 'callTracer output');
    if (frame.calls !== undefined)
      insist(Array.isArray(frame.calls), 'Malformed callTracer child list');
    insist(
      !frame.truncated && !frame.timeout && !frame.failed,
      'Truncated or unsupported callTracer evidence'
    );
    for (const child of frame.calls || []) validateFrame(child);
  }
  validateFrame(callTrace);
  insist(callTrace.error === undefined, 'Failed callTracer root');
  insist(
    callTrace.type === (transaction.to ? 'CALL' : 'CREATE'),
    'CallTracer root does not match transaction kind'
  );
  insist(
    lower(callTrace.from) === lower(transaction.from),
    'CallTracer root sender mismatch'
  );
  insist(
    lower(callTrace.to) === lower(transaction.to || receipt.contractAddress),
    'CallTracer root destination mismatch'
  );
  insist(
    lower(callTrace.input) === lower(transaction.data),
    'CallTracer root input mismatch'
  );
  insist(
    opcodeTrace &&
      typeof opcodeTrace === 'object' &&
      !Array.isArray(opcodeTrace),
    'Missing opcode trace'
  );
  insist(
    opcodeTrace.failed === false &&
      !opcodeTrace.error &&
      !opcodeTrace.truncated &&
      !opcodeTrace.timeout,
    'Failed or incomplete opcode trace'
  );
  insist(
    quantity(opcodeTrace.gas) &&
      typeof opcodeTrace.returnValue === 'string' &&
      Array.isArray(opcodeTrace.structLogs),
    'Unsupported opcode trace schema'
  );
  const returned = opcodeTrace.returnValue.startsWith('0x')
    ? opcodeTrace.returnValue
    : '0x' + opcodeTrace.returnValue;
  insist(
    bytes(returned, 'opcode return value') ===
      bytes(callTrace.output || '0x', 'callTracer output'),
    'Trace return values disagree'
  );
  const logs = opcodeTrace.structLogs;
  for (const log of logs) {
    insist(
      log &&
        typeof log === 'object' &&
        Number.isSafeInteger(log.pc) &&
        log.pc >= 0 &&
        Number.isSafeInteger(log.depth) &&
        log.depth >= 1 &&
        log.depth <= 1024 &&
        quantity(log.gas) &&
        quantity(log.gasCost) &&
        typeof log.op === 'string' &&
        /^[A-Z][A-Z0-9_]*$/.test(log.op),
      'Malformed or truncated opcode step'
    );
    insist(!log.error, 'Unsupported exceptional opcode execution');
    insist(
      Array.isArray(log.stack) && log.stack.length <= 1024,
      'Missing complete opcode stack'
    );
    for (const item of log.stack) word(item);
    insist(
      log.memory === undefined ||
        (Array.isArray(log.memory) &&
          log.memory.length * 32 <= MAX_MEMORY_BYTES &&
          log.memory.every(
            (item) =>
              typeof item === 'string' && /^(?:0x)?[a-fA-F0-9]{64}$/.test(item)
          )),
      'Missing complete opcode memory'
    );
  }
  if (!logs.length) {
    insist(
      emptyCodeCall &&
        transaction.to &&
        !(callTrace.calls || []).length &&
        bytes(callTrace.output || '0x', 'empty call output') === '0x',
      'Empty opcode trace cannot prove creation completeness'
    );
    return [];
  }
  // Each recursion consumes exactly one entered EVM context and returns at the
  // very next parent step; skipped depths, hidden siblings and truncation fail.
  function execute(frame, depth, start, context, ancestorReverted) {
    insist(
      logs[start]?.depth === depth &&
        logs[start]?.pc === 0 &&
        logs[start]?.stack.length === 0,
      'Invalid entered execution boundary'
    );
    const children = frame.calls || [];
    let childIndex = 0,
      index = start,
      memorySize = 0;
    while (index < logs.length) {
      const log = logs[index];
      insist(log.depth === depth, 'Opcode depth/hierarchy mismatch');
      insist(
        (log.memory?.length || 0) * 32 === memorySize,
        'Missing or inconsistent allocated opcode memory'
      );
      memorySize = expandedMemory(log, memorySize);
      if (TYPES.has(log.op)) {
        const child = children[childIndex++];
        insist(
          child && child.type === log.op,
          'Call/opcode trace attempt inventory mismatch'
        );
        insist(
          lower(child.from) === lower(context),
          'CallTracer child sender/context mismatch'
        );
        const create = isCreate(child);
        const count = create
          ? log.op === 'CREATE2'
            ? 4
            : 3
          : ['CALL', 'CALLCODE'].includes(log.op)
          ? 7
          : 6;
        insist(log.stack.length >= count, 'Opcode call stack underflow');
        const inputOffset = top(log, create ? 1 : count === 7 ? 3 : 2);
        const inputLength = top(log, create ? 2 : count === 7 ? 4 : 3);
        insist(
          memory(log, inputOffset, inputLength) === lower(child.input),
          'CallTracer child input/memory mismatch'
        );
        if (!create) {
          const target =
            '0x' +
            (top(log, 1) & ((1n << 160n) - 1n)).toString(16).padStart(40, '0');
          insist(
            lower(child.to) === target,
            'CallTracer child destination/stack mismatch'
          );
        }
        // Do not infer collisions, insufficient balance, precompile execution or
        // empty-code behavior from missing steps. These need another supported profile.
        insist(
          logs[index + 1]?.depth === depth + 1,
          'Unsupported no-entry call or invalid depth transition'
        );
        const nextContext = ['DELEGATECALL', 'CALLCODE'].includes(log.op)
          ? context
          : child.to;
        const ended = execute(
          child,
          depth + 1,
          index + 1,
          nextContext,
          ancestorReverted || frame.error !== undefined
        );
        const resume = logs[ended];
        insist(
          resume && resume.depth === depth && resume.pc === log.pc + 1,
          'Missing or invalid parent resumption'
        );
        const prefix = log.stack.slice(0, -count).map(word);
        insist(
          resume.stack.length === prefix.length + 1 &&
            prefix.every((value, n) => value === word(resume.stack[n])),
          'Parent call stack prefix/result mismatch'
        );
        const result = top(resume);
        if (child.error !== undefined) {
          insist(result === 0n, 'Failed child contradicts parent call result');
        } else if (create) {
          insist(
            result !== 0n &&
              result < 1n << 160n &&
              ethers.isAddress(child.to) &&
              result === BigInt(child.to),
            'CREATE result/address mismatch'
          );
          if (log.op === 'CREATE2') {
            const expected = ethers.getCreate2Address(
              context,
              ethers.toBeHex(top(log, 3), 32),
              ethers.keccak256(child.input)
            );
            insist(
              lower(expected) === lower(child.to),
              'CREATE2 salt/input/address mismatch'
            );
          }
        } else
          insist(
            result === 1n,
            'Successful child contradicts parent call result'
          );
        index = ended;
        continue;
      }
      if (TERMINALS.has(log.op)) {
        if (log.op === 'SELFDESTRUCT') top(log);
        insist(
          childIndex === children.length,
          'Unexecuted or truncated callTracer children'
        );
        const failed = log.op === 'REVERT';
        insist(
          failed === (frame.error !== undefined),
          'Child terminal outcome disagrees with callTracer'
        );
        const output = ['RETURN', 'REVERT'].includes(log.op)
          ? memory(log, top(log), top(log, 1))
          : '0x';
        insist(
          output === bytes(frame.output || '0x', 'callTracer output'),
          'Child terminal output/memory mismatch'
        );
        if (isCreate(frame) && !failed && !ancestorReverted) {
          insist(
            output !== '0x',
            'Successful CREATE has no complete runtime output'
          );
          creations.push({
            address: frame.to,
            input: frame.input,
            traceRuntime: output,
            kind: 'internal-trace',
          });
        }
        return index + 1;
      }
      advance(log, logs[index + 1]);
      index++;
    }
    throw new Error('Opcode trace lacks completed execution');
  }
  const end = execute(callTrace, 1, 0, callTrace.to, false);
  insist(end === logs.length, 'Unexpected opcode steps after root completion');
  return creations;
}
module.exports = { validateCreationTraces };
