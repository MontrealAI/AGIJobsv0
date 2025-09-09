import * as fs from 'fs';
import glob from 'glob';

const files = glob.sync('contracts/v2/**/*.sol');

const transferRegex = /\.(?:transfer|transferFrom|safeTransfer|safeTransferFrom)\s*\(/;
const modifierRegex = /requiresTaxAcknowledgement\b/;
const ackCallRegex = /_acknowledge\s*\(/;

function findClosingBrace(str: string, start: number): number {
  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return str.length;
}

let failed = false;
files.forEach((file) => {
  const src = fs.readFileSync(file, 'utf8');
  if (
    !src.includes('requiresTaxAcknowledgement') &&
    !src.includes('_acknowledge') &&
    !src.includes('TaxPolicy')
  ) {
    return;
  }
  const funcRegex = /function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*[^\{;]*\b(public|external)\b[^\{;]*\{/g;
  let match: RegExpExecArray | null;
  while ((match = funcRegex.exec(src)) !== null) {
    const name = match[1];
    const headerStart = match.index;
    const bodyStart = match.index + match[0].length;
    const bodyEnd = findClosingBrace(src, bodyStart - 1);
    const header = src.slice(headerStart, bodyStart);
    const body = src.slice(bodyStart, bodyEnd);

    if (transferRegex.test(body) && body.includes('msg.sender')) {
      if (!modifierRegex.test(header) && !ackCallRegex.test(body)) {
        const line = src.slice(0, headerStart).split('\n').length;
        console.error(`${file}:${line} function ${name} missing tax acknowledgement`);
        failed = true;
      }
    }
    funcRegex.lastIndex = bodyEnd;
  }
});

if (failed) {
  console.error('Tax acknowledgement check failed');
  process.exit(1);
}
