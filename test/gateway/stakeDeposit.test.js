const { expect } = require('chai');
const { artifacts, ethers } = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

describe('gateway current stake deposits', function () {
  let abi;
  before(async function () {
    abi = new ethers.Interface(
      (
        await artifacts.readArtifact(
          'contracts/v2/StakeManager.sol:StakeManager'
        )
      ).abi
    );
  });

  function coordinator({ balance = 2n, receiptError, readFailure } = {}) {
    const calls = { legacy: 0, deposit: [], allowance: 0, audit: [] };
    const filename = path.resolve(
      __dirname,
      '../../agent-gateway/stakeCoordinator.ts'
    );
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
      fileName: filename,
    });
    const receipt = async () => {
      if (receiptError) throw receiptError;
      return { status: 1 };
    };
    const dependencies = {
      ethers: {
        ...require('ethers'),
        Contract: class {
          async allowance() {
            calls.allowance++;
            if (readFailure?.method === 'allowance') throw readFailure.error;
            return 100n;
          }
        },
      },
      './utils': {
        TOKEN_DECIMALS: 18,
        stakeManager: {
          target: '0x1111111111111111111111111111111111111111',
          minStake: async () => {
            if (readFailure?.method === 'minStake') throw readFailure.error;
            return 10n;
          },
          stakeOf: async () => {
            if (readFailure?.method === 'stakeOf') throw readFailure.error;
            return balance;
          },
          connect: () => ({
            stake: async () => {
              calls.legacy++;
              return { wait: receipt };
            },
            depositStake: async (...args) => {
              abi.encodeFunctionData('depositStake', args);
              calls.deposit.push(args);
              return { wait: receipt };
            },
          }),
        },
      },
      '../shared/auditLogger': {
        recordAuditEvent: async (event) => calls.audit.push(event),
      },
    };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', compiled.outputText)(
      (name) => {
        if (!Object.hasOwn(dependencies, name))
          throw new Error(`Unexpected dependency: ${name}`);
        return dependencies[name];
      },
      module,
      module.exports
    );
    return { ...module.exports, calls };
  }

  it('uses the deployed deposit selector for only the missing stake', async function () {
    const { ensureStake, calls } = coordinator();
    await ensureStake(ethers.Wallet.createRandom(), 6n);
    expect(calls.deposit).to.deep.equal([[0, 8n]]);
    expect(calls.legacy).to.equal(0);
    expect(calls.audit.at(-1).metadata.method).to.equal('depositStake');
    expect(calls.audit.at(-1).success).to.equal(true);
  });

  it('propagates a lost receipt without a fallback transaction', async function () {
    const receiptError = new Error('receipt response lost');
    const { ensureStake, calls } = coordinator({ receiptError });
    let observed;
    try {
      await ensureStake(ethers.Wallet.createRandom(), 6n);
    } catch (error) {
      observed = error;
    }
    expect(observed).to.equal(receiptError);
    expect(calls.deposit).to.deep.equal([[0, 8n]]);
    expect(calls.legacy).to.equal(0);
    expect(calls.audit.at(-1).success).to.equal(false);
  });

  it('does not submit or approve when the existing stake meets the target', async function () {
    const { ensureStake, calls } = coordinator({ balance: 10n });
    await ensureStake(ethers.Wallet.createRandom(), 6n);
    expect(calls.deposit).to.deep.equal([]);
    expect(calls.legacy).to.equal(0);
    expect(calls.allowance).to.equal(0);
  });

  for (const method of ['minStake', 'stakeOf', 'allowance']) {
    it(`refuses a deposit when the ${method} read is uncertain`, async function () {
      const error = new Error(`${method} response lost`);
      const { ensureStake, calls } = coordinator({
        readFailure: { method, error },
      });
      let observed;
      try {
        await ensureStake(ethers.Wallet.createRandom(), 6n);
      } catch (failure) {
        observed = failure;
      }
      expect(observed).to.equal(error);
      expect(calls.deposit).to.deep.equal([]);
      expect(calls.legacy).to.equal(0);
    });
  }
});
