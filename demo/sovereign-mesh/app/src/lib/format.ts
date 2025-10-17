export const short = (value?: string) => {
  if (!value) return "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};
