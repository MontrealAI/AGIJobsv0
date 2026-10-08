const { expect } = require('chai');
const { artifacts, ethers } = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { compileAndRequireTsModule } = require('../utils/tsLoader');

describe('gateway startup event subscriptions', function () {
  it('matches every subscribed event to the actual deployed module ABI', async function () {
    const settings = {
      RPC_URL: 'http://127.0.0.1:1',
      KEYSTORE_URL: 'http://127.0.0.1:1/keys',
      JOB_REGISTRY_ADDRESS: '0x1111111111111111111111111111111111111111',
      VALIDATION_MODULE_ADDRESS: '0x2222222222222222222222222222222222222222',
      STAKE_MANAGER_ADDRESS: '0x3333333333333333333333333333333333333333',
      DISPUTE_MODULE_ADDRESS: '0x4444444444444444444444444444444444444444',
    };
    const previous = Object.fromEntries(
      Object.keys(settings).map((key) => [key, process.env[key]])
    );
    Object.assign(process.env, settings);
    let utils;
    try {
      utils = compileAndRequireTsModule(
        path.join(__dirname, '../../agent-gateway/utils.ts')
      );
      const moduleSources = {
        registry: 'contracts/v2/JobRegistry.sol:JobRegistry',
        validation: 'contracts/v2/ValidationModule.sol:ValidationModule',
        stakeManager: 'contracts/v2/StakeManager.sol:StakeManager',
        dispute: 'contracts/v2/modules/DisputeModule.sol:DisputeModule',
      };
      const deployed = {};
      for (const [name, source] of Object.entries(moduleSources)) {
        deployed[name] = new ethers.Interface(
          (await artifacts.readArtifact(source)).abi
        );
      }
      const eventFile = path.join(__dirname, '../../agent-gateway/events.ts');
      const source = ts.createSourceFile(
        eventFile,
        fs.readFileSync(eventFile, 'utf8'),
        ts.ScriptTarget.Latest,
        true
      );
      const observed = new Set();
      let subscriptions = 0;
      function visit(node) {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'on'
        ) {
          const name = node.expression.expression.getText(source);
          if (Object.hasOwn(moduleSources, name)) {
            const eventArgument = node.arguments[0];
            expect(ts.isStringLiteral(eventArgument)).to.equal(true);
            const eventName = eventArgument.text;
            const runtime = utils[name].interface.getEvent(eventName);
            const canonical = deployed[name].getEvent(eventName);
            expect(
              runtime,
              `${name}.${eventName} is missing at startup`
            ).not.to.equal(null);
            expect(
              canonical,
              `${name}.${eventName} is absent on chain`
            ).not.to.equal(null);
            expect(
              runtime.topicHash,
              `${name}.${eventName} signature`
            ).to.equal(canonical.topicHash);
            const layout = (event) =>
              event.inputs.map((input) => [input.type, Boolean(input.indexed)]);
            expect(
              layout(runtime),
              `${name}.${eventName} indexed fields`
            ).to.deep.equal(layout(canonical));
            observed.add(name);
            subscriptions += 1;
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      expect([...observed].sort()).to.deep.equal(
        Object.keys(moduleSources).sort()
      );
      expect(subscriptions).to.be.at.least(7);
    } finally {
      utils?.provider.destroy();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
