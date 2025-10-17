import { ethers } from "ethers";

export const getProvider = () => {
  const injected = (window as any).ethereum;
  if (!injected) {
    throw new Error("No injected Ethereum provider found");
  }
  return new ethers.BrowserProvider(injected);
};

export const getSigner = async () => {
  const provider = getProvider();
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
};
