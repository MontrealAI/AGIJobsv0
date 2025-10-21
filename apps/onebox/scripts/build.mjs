#!/usr/bin/env node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const distDir = path.join(appDir, "dist");
const templatePath = path.join(appDir, "index.html");
const configModuleUrl = pathToFileURL(path.join(appDir, "config.mjs"));

const hashedAssets = ["app.js", "styles.css"];
const passthroughAssets = ["url-overrides.js"];
const errorCatalogSource = path.resolve(__dirname, "../../..", "storage", "errors", "onebox.json");

const fingerprint = (buffer) =>
  createHash("sha256").update(buffer).digest("hex").slice(0, 16);

const computeIntegrity = (buffer) => ({
  sha384: `sha384-${createHash("sha384").update(buffer).digest("base64")}`,
  sha512: `sha512-${createHash("sha512").update(buffer).digest("base64")}`,
});

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

const manifest = {};

for (const asset of hashedAssets) {
  const sourcePath = path.join(appDir, asset);
  const buffer = await fs.readFile(sourcePath);
  const ext = path.extname(asset);
  const base = path.basename(asset, ext);
  const hashedName = `${base}.${fingerprint(buffer)}${ext}`;
  await fs.writeFile(path.join(distDir, hashedName), buffer);
  manifest[asset] = {
    file: hashedName,
    integrity: computeIntegrity(buffer),
  };
}

for (const asset of passthroughAssets) {
  const sourcePath = path.join(appDir, asset);
  const targetPath = path.join(distDir, asset);
  await fs.copyFile(sourcePath, targetPath);
}

const errorCatalogTarget = path.join(distDir, "storage", "errors", "onebox.json");
await fs.mkdir(path.dirname(errorCatalogTarget), { recursive: true });
await fs.copyFile(errorCatalogSource, errorCatalogTarget);

const manifestPath = path.join(distDir, "manifest.json");
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const template = await fs.readFile(templatePath, "utf8");
const { CONNECT_SRC_ORIGINS = [] } = await import(configModuleUrl.href);

const connectEntries = new Set(["'self'"]);
for (const origin of CONNECT_SRC_ORIGINS) {
  if (typeof origin === "string" && origin.trim()) {
    connectEntries.add(origin.trim());
  }
}

const scriptEntry = manifest["app.js"];
const stylesEntry = manifest["styles.css"];

if (!scriptEntry || !stylesEntry) {
  throw new Error("Manifest missing required entries for app.js or styles.css");
}

const formatIntegrity = (entry) => `${entry.integrity.sha384} ${entry.integrity.sha512}`;

const html = template
  .replace(/\{\{\s*app_js_src\s*\}\}/g, `./${scriptEntry.file}`)
  .replace(/\{\{\s*app_js_integrity\s*\}\}/g, formatIntegrity(scriptEntry))
  .replace(/\{\{\s*styles_css_href\s*\}\}/g, `./${stylesEntry.file}`)
  .replace(/\{\{\s*styles_css_integrity\s*\}\}/g, formatIntegrity(stylesEntry))
  .replace(/\{\{\s*connect_src\s*\}\}/g, Array.from(connectEntries).join(" "));

await fs.writeFile(path.join(distDir, "index.html"), html);

console.log(`Built onebox static bundle -> ${path.relative(process.cwd(), distDir)}`);
console.log(`Manifest written to ${path.relative(process.cwd(), manifestPath)}`);
