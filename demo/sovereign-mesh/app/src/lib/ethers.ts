import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

export const getProvider = () => {
  if (!window.ethereum) {
    throw new Error("No wallet detected. Please install MetaMask or another EIP-1193 provider.");
  }
  return new ethers.BrowserProvider(window.ethereum as ethers.Eip1193Provider);
};

export const getSigner = async () => (await getProvider()).getSigner();
