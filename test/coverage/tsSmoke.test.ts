import { expect } from 'chai';

describe('TypeScript coverage smoke', function () {
  it('handles arithmetic operations', function () {
    const values = [1, 2, 3];
    const sum = values.reduce((acc, value) => acc + value, 0);
    expect(sum).to.equal(6);
  });
});
