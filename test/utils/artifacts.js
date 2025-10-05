const path = require('path');
const hre = require('hardhat');

const AGIALPHA_FQN =
  'contracts/test/AGIALPHAToken.sol:AGIALPHAToken';

let compilePromise = null;
let stubArtifactCache = null;
let stubArtifactSaved = false;

function isMissingArtifactError(error) {
  return Boolean(error && typeof error === 'object' && error.number === 700);
}

function loadAgialphaStub() {
  if (!stubArtifactCache) {
    const stub = require('../utils/agialpha-artifact.json');
    const deployedBytecode = stub.bytecode.startsWith('0x')
      ? stub.bytecode
      : `0x${stub.bytecode}`;

    stubArtifactCache = {
      _format: 'hh-sol-artifact-1',
      contractName: 'AGIALPHAToken',
      sourceName: path.join('contracts', 'test', 'AGIALPHAToken.sol'),
      abi: stub.abi,
      bytecode: '0x',
      deployedBytecode,
      linkReferences: {},
      deployedLinkReferences: {},
    };
  }

  return stubArtifactCache;
}

async function ensureCompiled() {
  if (!compilePromise) {
    compilePromise = hre
      .run('compile')
      .catch((error) => {
        compilePromise = null;
        throw error;
      });
  }

  await compilePromise;
}

async function readArtifact(fullyQualifiedName) {
  try {
    return await hre.artifacts.readArtifact(fullyQualifiedName);
  } catch (error) {
    if (!isMissingArtifactError(error)) {
      throw error;
    }

    if (fullyQualifiedName === AGIALPHA_FQN) {
      const stub = loadAgialphaStub();
      if (!stubArtifactSaved) {
        await hre.artifacts.saveArtifactAndDebugFile(stub);
        stubArtifactSaved = true;
      }
      return stub;
    }

    await ensureCompiled();
    return hre.artifacts.readArtifact(fullyQualifiedName);
  }
}

module.exports = {
  readArtifact,
};
