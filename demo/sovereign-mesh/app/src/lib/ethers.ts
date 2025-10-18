import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

export const getProvider = () => {
  if (!window.ethereum) {
    throw new Error("No injected provider found");
  }
  return new ethers.BrowserProvider(window.ethereum as ethers.Eip1193Provider);
};

export const getSigner = async () => {
  const provider = getProvider();
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts || accounts.length === 0) {
    throw new Error("No account available");
  }
  return provider.getSigner();
};
