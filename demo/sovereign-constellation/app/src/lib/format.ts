import { ethers } from "ethers";

export const short = (addr?: string) => {
  if (!addr) return "";
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
};

export const formatAgia = (value: string | number | bigint) => {
  try {
    return `${Number(ethers.formatEther(value)).toLocaleString(undefined, {
      maximumFractionDigits: 4
    })} AGI`;
  } catch (err) {
    console.error("formatAgia", err);
    return String(value);
  }
};

export const formatTimestamp = (value?: Date) => {
  if (!value) return "—";
  return value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};
