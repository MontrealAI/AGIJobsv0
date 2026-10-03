import { Interface } from 'ethers';
import type { Log } from 'ethers';
import { startedRoundId } from '../src/selfplay-arena.js';

const arena = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';
const abi = new Interface([
  'event RoundStarted(uint256 indexed roundId, uint256 indexed teacherJobId, address indexed teacher, uint32 difficulty, uint64 startedAt)',
]);

function roundLog(
  id: bigint,
  address = arena,
): Pick<Log, 'address' | 'topics' | 'data'> {
  const encoded = abi.encodeEventLog(abi.getEvent('RoundStarted')!, [
    id,
    7n,
    other,
    3n,
    100n,
  ]);
  return { address, ...encoded };
}

describe('confirmed arena round identifiers', () => {
  it('uses the mined event ID and ignores matching events from other contracts', () => {
    expect(
      startedRoundId({ logs: [roundLog(41n, other), roundLog(42n)] }, arena),
    ).toBe(42);
  });

  it('rejects a receipt without an event from the configured arena', () => {
    expect(() =>
      startedRoundId({ logs: [roundLog(41n, other)] }, arena),
    ).toThrow('did not emit RoundStarted');
  });

  it('ignores unrelated arena events', () => {
    const unrelated = { address: arena, topics: [], data: '0x' };
    expect(startedRoundId({ logs: [unrelated, roundLog(9n)] }, arena)).toBe(9);
  });

  it.each([0n, BigInt(Number.MAX_SAFE_INTEGER) + 1n])(
    'rejects an unrepresentable round ID %s',
    (id) => {
      expect(() => startedRoundId({ logs: [roundLog(id)] }, arena)).toThrow(
        'unsupported round identifier',
      );
    },
  );
});
