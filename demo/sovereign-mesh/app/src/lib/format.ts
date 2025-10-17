export const short = (value?: string | null) => {
  if (!value) return "";
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};
