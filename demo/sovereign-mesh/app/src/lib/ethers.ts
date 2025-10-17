import { ethers } from "ethers";

export const getProvider = () => {
  const anyWindow = window as typeof window & { ethereum?: unknown };
  if (!anyWindow.ethereum) {
    throw new Error("No injected Ethereum provider detected");
  }
  return new ethers.BrowserProvider(anyWindow.ethereum);
};

export const getSigner = async () => {
  const provider = getProvider();
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
};
