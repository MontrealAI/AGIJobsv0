import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

export const getProvider = () => {
  if (!window.ethereum) {
    throw new Error("No injected provider available");
  }
  return new ethers.BrowserProvider(window.ethereum as ethers.Eip1193Provider);
};

export const getSigner = async () => {
  const provider = getProvider();
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
};
