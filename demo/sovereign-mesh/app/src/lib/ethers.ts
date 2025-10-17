import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export const getProvider = () => {
  if (!window.ethereum) {
    throw new Error("No injected Ethereum provider found");
  }
  return new ethers.BrowserProvider(window.ethereum);
};

export const getSigner = async () => {
  const provider = getProvider();
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
};
