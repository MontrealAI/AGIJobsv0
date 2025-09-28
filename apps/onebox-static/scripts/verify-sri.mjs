#!/usr/bin/env node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const distDir = path.join(appDir, "dist");
const manifestPath = path.join(distDir, "manifest.json");
const indexPath = path.join(distDir, "index.html");

const requiredEntries = ["app.mjs", "styles.css"];

const manifestExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

if (!(await manifestExists(manifestPath))) {
  throw new Error(
    "Manifest not found. Did you run the static build before verify:sri?",
  );
}

if (!(await manifestExists(indexPath))) {
  throw new Error(
    "Built index.html not found. Did you run the static build before verify:sri?",
  );
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

const computeIntegrity = (buffer) => ({
  sha384: `sha384-${createHash("sha384").update(buffer).digest("base64")}`,
  sha512: `sha512-${createHash("sha512").update(buffer).digest("base64")}`,
});

for (const entryKey of requiredEntries) {
  const entry = manifest[entryKey];
  if (!entry) {
    throw new Error(`Manifest missing required entry for ${entryKey}`);
  }
  if (!entry.file || !entry.integrity) {
    throw new Error(
      `Manifest entry for ${entryKey} must include file and integrity data`,
    );
  }

  const filePath = path.join(distDir, entry.file);
  if (!(await manifestExists(filePath))) {
    throw new Error(
      `Manifest entry for ${entryKey} points to missing file ${entry.file}`,
    );
  }

  const buffer = await fs.readFile(filePath);
  const actualIntegrity = computeIntegrity(buffer);

  for (const algo of ["sha384", "sha512"]) {
    if (entry.integrity[algo] !== actualIntegrity[algo]) {
      throw new Error(
        `Integrity mismatch for ${entryKey} (${algo}): manifest has ${entry.integrity[algo]}, actual is ${actualIntegrity[algo]}`,
      );
    }
  }
}

const html = await fs.readFile(indexPath, "utf8");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const expectScriptSrc = `./${manifest["app.mjs"].file}`;
const expectScriptIntegrity = `${manifest["app.mjs"].integrity.sha384} ${manifest["app.mjs"].integrity.sha512}`;
const expectStylesHref = `./${manifest["styles.css"].file}`;
const expectStylesIntegrity = `${manifest["styles.css"].integrity.sha384} ${manifest["styles.css"].integrity.sha512}`;

const scriptPattern = new RegExp(
  `<script[^>]*type="module"[^>]*src="${escapeRegExp(expectScriptSrc)}"[^>]*integrity="${escapeRegExp(expectScriptIntegrity)}"[^>]*crossorigin="anonymous"`,
);

if (!scriptPattern.test(html)) {
  throw new Error(
    "Built index.html is missing the expected <script> tag with integrity and crossorigin attributes",
  );
}

const linkPattern = new RegExp(
  `<link[^>]*rel="stylesheet"[^>]*href="${escapeRegExp(expectStylesHref)}"[^>]*integrity="${escapeRegExp(expectStylesIntegrity)}"[^>]*crossorigin="anonymous"`,
);

if (!linkPattern.test(html)) {
  throw new Error(
    "Built index.html is missing the expected <link> tag with integrity and crossorigin attributes",
  );
}

console.log("Static asset integrity verified successfully.");
