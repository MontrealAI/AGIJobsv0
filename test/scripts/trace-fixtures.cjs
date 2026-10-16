'use strict';
// Synthetic unit fixtures only. These execute a small deterministic instruction
// model; they are not client captures and never establish provider compatibility.
const word = (n) => BigInt(n).toString(16).padStart(64, '0');
function opcodeFixture(root) {
  const logs = [];
  function execute(frame, depth) {
    let pc = 0,
      stack = [],
      mem = [];
    const step = (op) =>
      logs.push({
        pc,
        op,
        depth,
        gas: 1000000,
        gasCost: 0,
        stack: [...stack],
        memory: [...mem],
      });
    const push = (n) => {
      step('PUSH32');
      pc += 33;
      stack.push(word(n));
    };
    function write(data) {
      data = data.slice(2);
      for (let i = 0; i < data.length; i += 64) {
        push('0x' + data.slice(i, i + 64).padEnd(64, '0'));
        push(i / 2);
        step('MSTORE');
        pc++;
        stack.splice(-2);
        mem[i / 64] = data.slice(i, i + 64).padEnd(64, '0');
      }
    }
    for (const child of frame.calls || []) {
      write(child.input);
      const length = (child.input.length - 2) / 2;
      const create = child.type === 'CREATE' || child.type === 'CREATE2';
      const args = create
        ? [0, 0, length, ...(child.type === 'CREATE2' ? [child.salt || 0] : [])]
        : ['CALL', 'CALLCODE'].includes(child.type)
        ? [100000, BigInt(child.to), 0, 0, length, 0, 0]
        : [100000, BigInt(child.to), 0, length, 0, 0];
      for (const arg of [...args].reverse()) push(arg);
      step(child.type);
      pc++;
      stack.splice(-args.length);
      execute(child, depth + 1);
      stack.push(word(child.error ? 0 : create ? BigInt(child.to) : 1));
      step('POP');
      pc++;
      stack.pop();
    }
    write(frame.output || '0x');
    push(((frame.output || '0x').length - 2) / 2);
    push(0);
    step(frame.error ? 'REVERT' : 'RETURN');
  }
  execute(root, 1);
  return {
    failed: false,
    gas: 50000,
    returnValue: (root.output || '0x').slice(2),
    structLogs: logs,
  };
}
module.exports = { opcodeFixture };
