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

const requiredEntries = ["app.js", "styles.css"];

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(manifestPath))) {
  throw new Error("Manifest not found. Run the static build before verifying SRI.");
}

if (!(await exists(indexPath))) {
  throw new Error("Built index.html not found. Run the static build before verifying SRI.");
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

const computeIntegrity = (buffer) => ({
  sha384: `sha384-${createHash("sha384").update(buffer).digest("base64")}`,
  sha512: `sha512-${createHash("sha512").update(buffer).digest("base64")}`,
});

for (const entryKey of requiredEntries) {
  const entry = manifest[entryKey];
  if (!entry || !entry.file || !entry.integrity) {
    throw new Error(`Manifest entry for ${entryKey} is incomplete.`);
  }

  const filePath = path.join(distDir, entry.file);
  if (!(await exists(filePath))) {
    throw new Error(`Manifest entry for ${entryKey} points to missing file ${entry.file}`);
  }

  const buffer = await fs.readFile(filePath);
  const actual = computeIntegrity(buffer);

  for (const algo of ["sha384", "sha512"]) {
    if (entry.integrity[algo] !== actual[algo]) {
      throw new Error(
        `Integrity mismatch for ${entryKey} (${algo}): manifest ${entry.integrity[algo]}, actual ${actual[algo]}`,
      );
    }
  }
}

const html = await fs.readFile(indexPath, "utf8");

const expectScriptSrc = `./${manifest["app.js"].file}`;
const expectScriptIntegrity = `${manifest["app.js"].integrity.sha384} ${manifest["app.js"].integrity.sha512}`;
const expectStylesHref = `./${manifest["styles.css"].file}`;
const expectStylesIntegrity = `${manifest["styles.css"].integrity.sha384} ${manifest["styles.css"].integrity.sha512}`;

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const scriptPattern = new RegExp(
  `<script[^>]*type="module"[^>]*src="${escape(expectScriptSrc)}"[^>]*integrity="${escape(expectScriptIntegrity)}"[^>]*crossorigin="anonymous"`,
);

if (!scriptPattern.test(html)) {
  throw new Error("Built index.html is missing the expected <script> tag with integrity and crossorigin attributes.");
}

const linkPattern = new RegExp(
  `<link[^>]*rel="stylesheet"[^>]*href="${escape(expectStylesHref)}"[^>]*integrity="${escape(expectStylesIntegrity)}"[^>]*crossorigin="anonymous"`,
);

if (!linkPattern.test(html)) {
  throw new Error("Built index.html is missing the expected stylesheet link with integrity and crossorigin attributes.");
}

console.log("Static asset integrity verified successfully.");
