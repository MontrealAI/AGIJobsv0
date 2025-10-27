import { ethers } from "ethers";

export const getProvider = () => {
  const ethereum = (window as any).ethereum;
  if (!ethereum) {
    throw new Error("No injected provider detected");
  }
  return new ethers.BrowserProvider(ethereum);
};

export const getSigner = async () => {
  const provider = getProvider();
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
};
