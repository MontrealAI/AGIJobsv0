import { exit } from 'node:process';

const [current, required] = process.argv.slice(2);
if (!current || !required) {
  console.error('[version-check] Usage: node version-check.mjs <current> <required>');
  exit(2);
}

const normalize = (version) => version.replace(/^v/, '').split('.').map((segment) => Number.parseInt(segment, 10));
const compare = (a, b) => {
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
};

const diff = compare(normalize(current), normalize(required));
exit(diff >= 0 ? 0 : 1);
