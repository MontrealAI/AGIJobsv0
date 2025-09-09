// Compute commit hash and reveal votes for job validation
// Usage:
//   node examples/commit-reveal.js commit <jobId> <approve> [subdomain]
//   node examples/commit-reveal.js reveal <jobId> <approve> <salt> [subdomain]
// Requires RPC_URL, PRIVATE_KEY and VALIDATION_MODULE env vars.

const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider(
  process.env.RPC_URL || 'http://localhost:8545'
);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const validationAbi = [
  'function commitValidation(uint256,bytes32,string,bytes32[])',
  'function revealValidation(uint256,bool,bytes32,string,bytes32[])',
];

const validation = new ethers.Contract(
  process.env.VALIDATION_MODULE,
  validationAbi,
  wallet
);

async function commit(jobId, approve, subdomain, proof) {
  const salt = ethers.randomBytes(32);
  const hash = ethers.solidityPackedKeccak256(
    ['bool', 'bytes32'],
    [approve, salt]
  );
  console.log('Commit hash', hash);
  console.log('Salt', ethers.hexlify(salt), 'save for reveal');
  const labelhash = ethers.id(subdomain);
  await validation.commitValidation(jobId, hash, labelhash, proof);
}

async function reveal(jobId, approve, salt, subdomain, proof) {
  const labelhash = ethers.id(subdomain);
  await validation.revealValidation(jobId, approve, salt, labelhash, proof);
}

async function main() {
  const [action, jobIdArg, approveArg, arg4, arg5] = process.argv.slice(2);
  if (!action || !jobIdArg || !approveArg) {
    console.error(
      'Usage: node examples/commit-reveal.js commit|reveal jobId approve [salt] [subdomain]'
    );
    return;
  }
  const jobId = BigInt(jobIdArg);
  const approve = approveArg === 'true';
  if (action === 'commit') {
    const subdomain = arg4 || '';
    const proof = [];
    await commit(jobId, approve, subdomain, proof);
  } else if (action === 'reveal') {
    const salt = arg4;
    const subdomain = arg5 || '';
    const proof = [];
    await reveal(jobId, approve, salt, subdomain, proof);
  } else {
    console.error('Unknown action', action);
  }
}

main().catch((err) => {
  console.error(err);
});
