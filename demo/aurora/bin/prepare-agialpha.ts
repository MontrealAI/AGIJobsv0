import hre from 'hardhat';

const { artifacts, ethers, network } = hre;
const TOKEN_ADDRESS = '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA';

async function main() {
  let artifact;
  try {
    artifact = await artifacts.readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Artifact')) {
      await hre.run('compile');
      artifact = await artifacts.readArtifact(
        'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
      );
    } else {
      throw error;
    }
  }

  const tokenAddress = ethers.getAddress(TOKEN_ADDRESS);
  const [deployer] = await ethers.getSigners();
  const ownerSlot = ethers.toBeHex(5, 32);
  const ownerValue = ethers.zeroPadValue(deployer.address, 32);

  const rpcVariants = [
    {
      label: 'Hardhat',
      setCode: 'hardhat_setCode',
      setStorage: 'hardhat_setStorageAt',
    },
    {
      label: 'Anvil',
      setCode: 'anvil_setCode',
      setStorage: 'anvil_setStorageAt',
    },
  ] as const;

  let lastError: unknown;

  for (const variant of rpcVariants) {
    const setCodeResult = await trySend(variant.setCode, [
      tokenAddress,
      artifact.deployedBytecode,
    ]);
    if (!setCodeResult.success) {
      lastError = setCodeResult.error;
      continue;
    }

    const setStorageResult = await trySend(variant.setStorage, [
      tokenAddress,
      ownerSlot,
      ownerValue,
    ]);

    if (!setStorageResult.success) {
      lastError = setStorageResult.error;
      continue;
    }

    console.log(
      `[aurora-local] Prepared AGIALPHA token at ${tokenAddress} using ${variant.label} RPCs`
    );
    return;
  }

  const errorMessage =
    lastError instanceof Error
      ? lastError.message
      : typeof lastError === 'string'
        ? lastError
        : JSON.stringify(lastError ?? 'unknown error');
  throw new Error(
    `Failed to set AGIALPHA token bytecode or storage via known RPC methods: ${errorMessage}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

type TrySendResult = { success: true } | { success: false; error: unknown };

async function trySend(method: string, params: unknown[]): Promise<TrySendResult> {
  try {
    await network.provider.send(method, params);
    return { success: true };
  } catch (error) {
    if (isMethodNotFound(error)) {
      return { success: false, error };
    }

    throw error;
  }
}

function isMethodNotFound(error: unknown) {
  if (!error) {
    return false;
  }

  const rpcError = error as {
    code?: number;
    error?: { code?: number; message?: string };
    message?: string;
  };

  const errorCode = rpcError.code ?? rpcError.error?.code;
  if (errorCode === -32601) {
    return true;
  }

  const nestedMessage = rpcError.error?.message?.toLowerCase() ?? '';
  const message = rpcError.message?.toLowerCase() ?? nestedMessage;

  if (!message) {
    return false;
  }

  return (
    message.includes('method not found') ||
    (message.includes('method') &&
      (message.includes('not supported') || message.includes('does not exist')))
  );
}
