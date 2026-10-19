if (require.main === module) {
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const Mocha = require('mocha');
const suite = new Mocha({ timeout: 30000 });
for (const file of [
  'test/gateway/routesValidation.test.ts',
  'test/gateway/authPrincipal.test.js',
  'test/gateway/websocketAuthorization.test.js',
  'test/gateway/deliverableStorage.test.js',
  'test/v2/ValidationStoreSafety.test.js',
]) suite.addFile(file);
suite.run((failures) => { process.exitCode = failures ? 1 : 0; });
}
