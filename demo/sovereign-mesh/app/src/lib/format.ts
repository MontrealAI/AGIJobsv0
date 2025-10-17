export const short = (value: string | undefined) => {
  if (!value) return "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};
