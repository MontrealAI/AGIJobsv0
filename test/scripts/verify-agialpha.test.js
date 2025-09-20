const { expect } = require('chai');
const { mkdtempSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');
const os = require('os');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs' },
});

const { verifyAgialpha } = require('../../scripts/verify-agialpha');

function createConstantsSource({ address, decimals, burnAddress }) {
  return `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.25;\n\naddress constant AGIALPHA = ${address};\nuint8 constant AGIALPHA_DECIMALS = ${decimals};\nuint256 constant TOKEN_SCALE = 1;\naddress constant BURN_ADDRESS = ${burnAddress};\n`;
}

function writeFixture({ address, decimals, burnAddress }) {
  const dir = mkdtempSync(join(os.tmpdir(), 'verify-agialpha-'));
  const constantsPath = join(dir, 'Constants.sol');
  const configPath = join(dir, 'agialpha.json');
  writeFileSync(
    constantsPath,
    createConstantsSource({ address, decimals, burnAddress })
  );
  writeFileSync(
    configPath,
    JSON.stringify({ address, decimals, burnAddress }, null, 2)
  );
  return { dir, constantsPath, configPath };
}

describe('verifyAgialpha script', () => {
  const address = '0x1111111111111111111111111111111111111111';
  const burnAddress = '0x0000000000000000000000000000000000000000';

  it('passes when config and constants match', () => {
    const { dir, constantsPath, configPath } = writeFixture({
      address,
      decimals: 18,
      burnAddress,
    });
    try {
      expect(() => verifyAgialpha(configPath, constantsPath)).to.not.throw();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when burn address differs', () => {
    const { dir, constantsPath } = writeFixture({
      address,
      decimals: 18,
      burnAddress,
    });
    const mismatchedConfig = join(dir, 'agialpha-mismatch.json');
    writeFileSync(
      mismatchedConfig,
      JSON.stringify(
        {
          address,
          decimals: 18,
          burnAddress: '0x000000000000000000000000000000000000dEaD',
        },
        null,
        2
      )
    );
    try {
      expect(() => verifyAgialpha(mismatchedConfig, constantsPath)).to.throw(
        'Burn address mismatch'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
