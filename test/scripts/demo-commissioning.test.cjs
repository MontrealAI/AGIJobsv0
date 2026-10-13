const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  checkCommissioning,
} = require('../../scripts/production/commissioning.cjs');
const modules = Object.values(
  require('../../config/implementation-modules.json')
).flat();
const address = (n) => '0x' + n.toString(16).padStart(40, '0');
const { Interface } = require('ethers');
const tx = (n) => '0x' + n.toString(16).padStart(64, '0');
const { inventory } = require('../../scripts/v2/lib/deployment-candidate.cjs');

function fixture(t, sizes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-receipts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
  };
  const implementations = Object.fromEntries(
    modules.map((name, i) => [name, address(i + 1)])
  );
  const contracts = Object.fromEntries(
    inventory()
      .filter(({ name }) => !modules.includes(name))
      .map(({ name }, i) => [name, address(i + 21)])
  );
  const constructorAbi = ['constructor(uint256 amount, address owner)'];
  const argsFor = (name) =>
    name === 'Deployer' || modules.includes(name) ? [] : ['123', address(777)];
  const abiFor = (name) =>
    name === 'Deployer' || modules.includes(name) ? [] : constructorAbi;
  const creationRecords = Object.fromEntries(
    Object.entries({ ...implementations, ...contracts }).map(
      ([name, value]) => [
        name,
        {
          address: value,
          args: argsFor(name),
          source:
            inventory().find((item) => item.name === name).source + ':' + name,
          constructorArguments: new Interface(abiFor(name)).encodeDeploy(
            argsFor(name)
          ),
        },
      ]
    )
  );
  write('deploy.json', {
    network: 'localhost',
    implementations,
    contracts,
    creationRecords,
  });
  write('mission.json', {
    jobs: sizes.map((n, i) => ({
      slug: 'job-' + (i + 1),
      jobId: String(i + 1),
    })),
  });
  const committees = {};
  for (const [i, n] of sizes.entries()) {
    const slug = 'job-' + (i + 1);
    committees[slug] = { k: 2, n };
    write('jobs/' + slug + '/validate.json', {
      committeeSize: n,
      requiredApprovals: 2,
      commits: n,
      reveals: n,
      validators: Array.from({ length: n }, (_, j) => ({
        address: address(j + 101),
        commitTx: tx(i * 20 + j + 100),
        revealTx: tx(i * 20 + j + 200),
      })),
    });
    write('jobs/' + slug + '/finalize.json', {
      jobId: String(i + 1),
      status: 'Finalized',
      success: true,
      chainId: '31337',
      blockNumber: i + 100,
      txHash: tx(i + 1),
      payouts: Object.fromEntries(
        Array.from({ length: n + 1 }, (_, j) => [
          address(j + 100),
          { delta: '1' },
        ])
      ),
    });
  }
  return {
    root,
    write,
    options: {
      expectedJobs: sizes.length,
      committees,
      readArtifact: ({ name }) => ({ abi: abiFor(name) }),
    },
  };
}
test('commissioning supports configured mixed committee sizes and four-job missions', (t) => {
  const mixed = fixture(t, [5, 4, 5]);
  assert.deepEqual(
    checkCommissioning(mixed.root, mixed.options).validatorsPerJob,
    [5, 4, 5]
  );
  const atlas = fixture(t, [5, 5, 5, 5]);
  assert.equal(checkCommissioning(atlas.root, atlas.options).settledJobs, 4);
  assert.throws(
    () => checkCommissioning(atlas.root, { ...atlas.options, expectedJobs: 3 }),
    /Every configured/
  );
});
test('commissioning accepts explicitly disabled tax policy and still requires every deployed constructor', (t) => {
  const data = fixture(t, [3, 3, 3]);
  const deployment = JSON.parse(
    fs.readFileSync(path.join(data.root, 'deploy.json'))
  );
  data.write('deploy.json', { ...deployment, withTax: true });
  assert.equal(
    checkCommissioning(data.root, data.options).constructorRecords,
    25
  );
  const withoutTax = structuredClone(deployment);
  withoutTax.withTax = false;
  withoutTax.contracts.TaxPolicy = 'disabled';
  delete withoutTax.creationRecords.TaxPolicy;
  data.write('deploy.json', withoutTax);
  const report = checkCommissioning(data.root, data.options);
  assert.equal(report.constructorRecords, 24);
  assert.equal(report.settledJobs, 3);
  for (const change of [
    (d) => {
      d.withTax = true;
    },
    (d) => {
      delete d.withTax;
    },
    (d) => {
      d.creationRecords.TaxPolicy = deployment.creationRecords.TaxPolicy;
    },
    (d) => {
      delete d.creationRecords.JobRegistry;
    },
    (d) => {
      d.creationRecords.FeePool.constructorArguments = '0x01';
    },
  ]) {
    const altered = structuredClone(withoutTax);
    change(altered);
    data.write('deploy.json', altered);
    assert.throws(() => checkCommissioning(data.root, data.options));
  }
});
test('commissioning rejects omitted implementations and incorrect constructor evidence', (t) => {
  const data = fixture(t, [3, 3, 3]);
  const deployment = JSON.parse(
    fs.readFileSync(path.join(data.root, 'deploy.json'))
  );
  assert.equal(
    checkCommissioning(data.root, data.options).constructorRecords,
    25
  );
  for (const change of [
    (d) => {
      delete d.creationRecords.StakeManagerEscrow;
    },
    (d) => {
      d.creationRecords.StakeManagerEscrow.constructorArguments = '0x01';
    },
    (d) => {
      d.creationRecords.Deployer.args = [1];
    },
    (d) => {
      d.creationRecords.JobRegistry.source = 'Wrong.sol:JobRegistry';
    },
    (d) => {
      d.creationRecords.JobRegistry.constructorArguments = '0x01';
    },
    (d) => {
      d.creationRecords.JobRegistry.args[0] = '124';
    },
  ]) {
    const altered = structuredClone(deployment);
    change(altered);
    data.write('deploy.json', altered);
    assert.throws(() => checkCommissioning(data.root, data.options));
  }
});
test('commissioning rejects placeholder hashes, wrong committees and unpaid validators', (t) => {
  const data = fixture(t, [5, 4, 5]);
  const finalFile = 'jobs/job-1/finalize.json',
    validationFile = 'jobs/job-1/validate.json';
  const final = JSON.parse(fs.readFileSync(path.join(data.root, finalFile)));
  const validation = JSON.parse(
    fs.readFileSync(path.join(data.root, validationFile))
  );
  data.write(finalFile, { ...final, txHash: tx(0) });
  assert.throws(() => checkCommissioning(data.root, data.options));
  data.write(finalFile, { ...final, payouts: {} });
  assert.throws(() => checkCommissioning(data.root, data.options), /payouts/);
  data.write(finalFile, final);
  data.write(validationFile, { ...validation, requiredApprovals: 1 });
  assert.throws(() => checkCommissioning(data.root, data.options));
  data.write(validationFile, {
    ...validation,
    validators: [...validation.validators, validation.validators[0]],
  });
  assert.throws(() => checkCommissioning(data.root, data.options));
  data.write(validationFile, {
    ...validation,
    validators: validation.validators.map((v, i) =>
      i ? v : { ...v, commitTx: tx(0) }
    ),
  });
  assert.throws(() => checkCommissioning(data.root, data.options));
});
