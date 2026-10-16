'use strict';
const { ethers } = require('ethers');
const { ExternalWait, OPERATION_KEYS } = require('./external-session.cjs');
const modules = require('../../config/implementation-modules.json');
const { requireTransactionEnvelope } = require('./external-envelope.cjs');
const implementations = Object.values(modules).flat();
function checkOperation({ key, name, to, data, source, operations, governor }) {
  if (!OPERATION_KEYS.includes(key))
    throw Error(
      'Operation is outside the closed external deployment allowlist'
    );
  if (key.startsWith('create:')) {
    if (
      key !== `create:${name}` ||
      !['Deployer', ...implementations].includes(name) ||
      to !== null ||
      data !== source.bytecode
    )
      throw Error('External CREATE differs from exact source-bound initcode');
    return;
  }
  if (key.startsWith('handover:')) {
    const expected = new ethers.Interface([
      'function transferOwnership(address)',
    ]).encodeFunctionData('transferOwnership', [governor]);
    if (
      key !== `handover:${name}` ||
      !['Deployer', ...implementations].includes(name) ||
      to !== operations[`create:${name}`]?.address ||
      data !== expected
    )
      throw Error(
        'External handover differs from this campaign creation and governor'
      );
    return;
  }
  if (name !== 'Deployer' || to !== operations['create:Deployer']?.address)
    throw Error('External call must target this campaign coordinator');
  const iface = new ethers.Interface(source.abi),
    decoded = iface.parseTransaction({ data });
  if (
    !decoded ||
    iface.encodeFunctionData(decoded.fragment, decoded.args) !== data
  )
    throw Error('External calldata is not canonical');
  if (
    key === 'commit' &&
    decoded.name === 'commitConfiguration' &&
    decoded.args[0] !== ethers.ZeroHash
  )
    return;
  if (
    key === 'register' &&
    decoded.name === 'registerModules' &&
    decoded.args[0].length === 14 &&
    decoded.args[0].every((a) => a !== ethers.ZeroAddress)
  )
    return;
  if (
    key === 'finalize' &&
    decoded.name === 'deployPaused' &&
    ethers.getAddress(decoded.args[2]) === governor &&
    decoded.args[3] === true
  )
    return;
  if (key.startsWith('component:') && decoded.name === 'deployComponent') {
    const component = key.slice('component:'.length);
    if (
      decoded.args[0] === ethers.id(component) &&
      decoded.args[2] === Object.hasOwn(modules, component) &&
      decoded.args[1].length > 2
    )
      return;
  }
  throw Error(
    'External calldata is outside the reviewed paused deployment operation'
  );
}
class ExternalManualSigner extends ethers.AbstractSigner {
  constructor(provider, session) {
    super(provider);
    this.session = session;
    this.address = session.plan.creator;
    Object.defineProperty(this, 'externalManual', { value: true });
  }
  async getAddress() {
    return this.address;
  }
  connect(provider) {
    if (provider !== this.provider)
      throw Error('External provider cannot change');
    return this;
  }
  async signTransaction() {
    throw Error(
      'Manual signatures must be imported through the exact private session'
    );
  }
  async signMessage() {
    throw Error('External deployment signer does not sign messages');
  }
  async signTypedData() {
    throw Error('External deployment signer does not sign typed data');
  }
  async authorize() {
    throw Error(
      'Delegation authorization is outside external deployment scope'
    );
  }
  async sendTransaction() {
    throw Error('External deployment never signs or broadcasts automatically');
  }
  async prepareAuthorityOperation({
    key,
    name,
    to,
    data,
    source,
    operations,
    operation,
  }) {
    checkOperation({
      key,
      name,
      to,
      data,
      source,
      operations,
      governor: this.session.plan.governor,
    });
    const prior = await this.session.operation(key);
    if (prior) {
      const expected = {
        ...prior.envelope.transaction,
        to,
        data,
        nonce: operation.nonce,
        value: '0',
      };
      // Canonical unsigned serialization binds every field even before a signature exists.
      if (
        ethers.Transaction.from(expected).unsignedHash !==
        prior.envelope.unsignedHash
      )
        throw Error('Private external operation differs from authority intent');
      throw new ExternalWait(
        prior.envelope.context.operationIndex,
        prior.state
      );
    }
    const envelope = await this.session.prepare({
      key,
      compilerInputSha256: source.compilerInputSha256,
      transaction: {
        type: 2,
        chainId: String(operation.chainId),
        nonce: operation.nonce,
        to,
        value: '0',
        data,
        ...this.session.plan.fees,
        accessList: [],
      },
    });
    return envelope;
  }
  requireEnvelope(envelope, transaction) {
    return requireTransactionEnvelope(envelope, transaction);
  }
}
module.exports = { ExternalManualSigner, checkOperation };
