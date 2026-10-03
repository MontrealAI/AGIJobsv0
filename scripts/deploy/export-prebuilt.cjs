'use strict';

const fs = require('node:fs');
const path = require('node:path');
const modules = require('../../config/implementation-modules.json');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'scripts/v2/lib/prebuilt');

function readArtifact(name, implementation = false) {
  const source = `contracts/v2/${
    implementation ? 'implementation/' : ''
  }${name}.sol`;
  const { abi, bytecode } = JSON.parse(
    fs.readFileSync(
      path.join(root, 'artifacts', source, `${name}.json`),
      'utf8'
    )
  );
  return { abi, bytecode };
}

function writeArtifact(name, artifact) {
  fs.writeFileSync(
    path.join(output, `${name}.json`),
    `${JSON.stringify(artifact, null, 2)}\n`
  );
}

const implementations = {};
for (const [controller, names] of Object.entries(modules)) {
  writeArtifact(controller, readArtifact(controller));
  for (const name of names) implementations[name] = readArtifact(name, true);
}
writeArtifact('ImplementationModules', implementations);
console.log('Updated prebuilt controllers and their fixed implementations.');
