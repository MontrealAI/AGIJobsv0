import { ethers } from "ethers";

export const short = (value?: string | null) => {
  if (!value) return "";
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

export const formatToken = (
  value: string | bigint,
  decimals = 2,
  symbol = "AGIA"
) => {
  try {
    const formatted = ethers.formatEther(value ?? 0);
    const [wholeRaw, fractionalRaw = ""] = formatted.split(".");
    const whole = BigInt(wholeRaw || "0").toLocaleString();
    if (decimals <= 0) {
      return `${whole} ${symbol}`;
    }
    const fractional = fractionalRaw.padEnd(decimals, "0").slice(0, decimals);
    return `${whole}.${fractional} ${symbol}`;
  } catch (err) {
    console.warn("[Sovereign Mesh] Unable to format token", value, err);
    return `${value} ${symbol}`;
  }
};

export const titleCase = (value: string) =>
  value
    ? value
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim()
    : "";
