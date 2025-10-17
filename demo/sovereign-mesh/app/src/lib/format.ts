import { ethers } from "ethers";

export const short = (value?: string | null) => {
  if (!value) return "";
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

export const formatAgi = (value: string | bigint | number) => {
  try {
    const formatted = Number(ethers.formatEther(value)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4
    });
    return `${formatted} AGIA`;
  } catch (err) {
    console.warn("Unable to format value as AGIA", err);
    return String(value);
  }
};
