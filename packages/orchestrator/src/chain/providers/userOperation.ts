import { ethers } from "ethers";

export interface UserOperationStruct {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: string;
  signature: string;
}

export function userOperationToJson(userOp: UserOperationStruct): Record<string, string> {
  return {
    sender: ethers.getAddress(userOp.sender),
    nonce: ethers.toBeHex(userOp.nonce),
    initCode: userOp.initCode,
    callData: userOp.callData,
    callGasLimit: ethers.toBeHex(userOp.callGasLimit),
    verificationGasLimit: ethers.toBeHex(userOp.verificationGasLimit),
    preVerificationGas: ethers.toBeHex(userOp.preVerificationGas),
    maxFeePerGas: ethers.toBeHex(userOp.maxFeePerGas),
    maxPriorityFeePerGas: ethers.toBeHex(userOp.maxPriorityFeePerGas),
    paymasterAndData: userOp.paymasterAndData,
    signature: userOp.signature,
  };
}

export function packUserOperation(userOp: UserOperationStruct): string {
  const types = [
    "address",
    "uint256",
    "bytes",
    "bytes",
    "uint256",
    "uint256",
    "uint256",
    "uint256",
    "uint256",
    "bytes",
    "bytes",
  ];
  const values = [
    userOp.sender,
    userOp.nonce,
    userOp.initCode,
    userOp.callData,
    userOp.callGasLimit,
    userOp.verificationGasLimit,
    userOp.preVerificationGas,
    userOp.maxFeePerGas,
    userOp.maxPriorityFeePerGas,
    userOp.paymasterAndData,
    userOp.signature,
  ];
  return ethers.AbiCoder.defaultAbiCoder().encode(types, values);
}

export function userOperationHash(
  userOp: UserOperationStruct,
  entryPoint: string,
  chainId: bigint
): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "uint256"],
    [
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          [
            "address",
            "uint256",
            "bytes32",
            "bytes32",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "bytes32",
          ],
          [
            userOp.sender,
            userOp.nonce,
            ethers.keccak256(userOp.initCode),
            ethers.keccak256(userOp.callData),
            userOp.callGasLimit,
            userOp.verificationGasLimit,
            userOp.preVerificationGas,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas,
            ethers.keccak256(userOp.paymasterAndData),
          ]
        )
      ),
      entryPoint,
      chainId,
    ]
  );
  return ethers.keccak256(encoded);
}

