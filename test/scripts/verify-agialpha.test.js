const { expect } = require('chai');
const { mkdtempSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');
const os = require('os');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs' },
});

const { verifyAgialpha } = require('../../scripts/verify-agialpha');

async function expectRejection(promise, pattern) {
  try {
    await promise;
  } catch (err) {
    expect(err).to.be.instanceOf(Error);
    expect((err && err.message) || '').to.match(pattern);
    return;
  }
  throw new Error('Expected promise to be rejected');
}

function createConstantsSource({
  address,
  decimals,
  burnAddress,
  symbol,
  name,
}) {
  return `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.25;\n\naddress constant AGIALPHA = ${address};\nuint8 constant AGIALPHA_DECIMALS = ${decimals};\nstring constant AGIALPHA_SYMBOL = ${JSON.stringify(
    symbol
  )};\nstring constant AGIALPHA_NAME = ${JSON.stringify(
    name
  )};\nuint256 constant TOKEN_SCALE = 1;\naddress constant BURN_ADDRESS = ${burnAddress};\n`;
}

function writeFixture({ address, decimals, burnAddress, symbol, name }) {
  const dir = mkdtempSync(join(os.tmpdir(), 'verify-agialpha-'));
  const constantsPath = join(dir, 'Constants.sol');
  const configPath = join(dir, 'agialpha.json');
  writeFileSync(
    constantsPath,
    createConstantsSource({ address, decimals, burnAddress, symbol, name })
  );
  writeFileSync(
    configPath,
    JSON.stringify({ address, decimals, burnAddress, symbol, name }, null, 2)
  );
  return { dir, constantsPath, configPath };
}

describe('verifyAgialpha script', () => {
  const address = '0x1111111111111111111111111111111111111111';
  const burnAddress = '0x0000000000000000000000000000000000000000';
  const symbol = 'AGIALPHA';
  const name = 'AGI ALPHA';

  it('passes when config and constants match', async () => {
    const { dir, constantsPath, configPath } = writeFixture({
      address,
      decimals: 18,
      burnAddress,
      symbol,
      name,
    });
    try {
      const result = await verifyAgialpha(configPath, constantsPath, {
        skipOnChain: true,
      });
      expect(result.onChainVerified).to.equal(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when burn address differs', async () => {
    const { dir, constantsPath } = writeFixture({
      address,
      decimals: 18,
      burnAddress,
      symbol,
      name,
    });
    const mismatchedConfig = join(dir, 'agialpha-mismatch.json');
    writeFileSync(
      mismatchedConfig,
      JSON.stringify(
        {
          address,
          decimals: 18,
          burnAddress: '0x000000000000000000000000000000000000dEaD',
          symbol,
          name,
        },
        null,
        2
      )
    );
    try {
      await expectRejection(
        verifyAgialpha(mismatchedConfig, constantsPath, {
          skipOnChain: true,
        }),
        /Burn address mismatch/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when symbol differs', async () => {
    const { dir, constantsPath } = writeFixture({
      address,
      decimals: 18,
      burnAddress,
      symbol,
      name,
    });
    const mismatchedConfig = join(dir, 'agialpha-symbol.json');
    writeFileSync(
      mismatchedConfig,
      JSON.stringify(
        {
          address,
          decimals: 18,
          burnAddress,
          symbol: 'WRONG',
          name,
        },
        null,
        2
      )
    );
    try {
      await expectRejection(
        verifyAgialpha(mismatchedConfig, constantsPath, {
          skipOnChain: true,
        }),
        /Symbol mismatch/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when name differs', async () => {
    const { dir, constantsPath } = writeFixture({
      address,
      decimals: 18,
      burnAddress,
      symbol,
      name,
    });
    const mismatchedConfig = join(dir, 'agialpha-name.json');
    writeFileSync(
      mismatchedConfig,
      JSON.stringify(
        {
          address,
          decimals: 18,
          burnAddress,
          symbol,
          name: 'Not AGI ALPHA',
        },
        null,
        2
      )
    );
    try {
      await expectRejection(
        verifyAgialpha(mismatchedConfig, constantsPath, {
          skipOnChain: true,
        }),
        /Name mismatch/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('on-chain metadata checks', () => {
    function createOnChainFixture() {
      return writeFixture({
        address,
        decimals: 18,
        burnAddress,
        symbol,
        name,
      });
    }

    it('passes when metadata matches', async () => {
      const { dir, constantsPath, configPath } = createOnChainFixture();
      try {
        const result = await verifyAgialpha(configPath, constantsPath, {
          provider: { call: async () => '0x' },
          fetchMetadata: async () => ({
            decimals: 18,
            symbol,
            name,
          }),
        });
        expect(result.onChainVerified).to.equal(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fails when chain decimals differ', async () => {
      const { dir, constantsPath, configPath } = createOnChainFixture();
      try {
        await expectRejection(
          verifyAgialpha(configPath, constantsPath, {
            provider: { call: async () => '0x' },
            fetchMetadata: async () => ({
              decimals: 19,
              symbol,
              name,
            }),
          }),
          /On-chain decimals mismatch/
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fails when chain symbol differs', async () => {
      const { dir, constantsPath, configPath } = createOnChainFixture();
      try {
        await expectRejection(
          verifyAgialpha(configPath, constantsPath, {
            provider: { call: async () => '0x' },
            fetchMetadata: async () => ({
              decimals: 18,
              symbol: 'OTHER',
              name,
            }),
          }),
          /On-chain symbol mismatch/
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fails when chain name differs', async () => {
      const { dir, constantsPath, configPath } = createOnChainFixture();
      try {
        await expectRejection(
          verifyAgialpha(configPath, constantsPath, {
            provider: { call: async () => '0x' },
            fetchMetadata: async () => ({
              decimals: 18,
              symbol,
              name: 'Different',
            }),
          }),
          /On-chain name mismatch/
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
