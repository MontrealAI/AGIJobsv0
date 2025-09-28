#!/usr/bin/env node
import { build } from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const distDir = path.join(appDir, "dist");
const templatePath = path.join(appDir, "index.html");

const entryPoints = {
  app: "app.mjs",
  styles: "styles.css",
};

const posix = (value) => value.split(path.sep).join("/");
const entryMeta = new Map(
  Object.entries(entryPoints).map(([key, relativePath]) => {
    const normalized = posix(relativePath.replace(/^\.\//, ""));
    return [normalized, { key, relativePath, basename: path.basename(relativePath) }];
  }),
);

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

const result = await build({
  absWorkingDir: appDir,
  entryPoints,
  bundle: true,
  format: "esm",
  target: ["es2020"],
  outdir: distDir,
  entryNames: "[name].[hash]",
  assetNames: "[name].[hash]",
  chunkNames: "chunk.[name].[hash]",
  metafile: true,
  minify: true,
  sourcemap: false,
});

const manifest = {};
for (const [outfile, output] of Object.entries(result.metafile.outputs)) {
  if (!output.entryPoint) continue;
  const entryPoint = posix(output.entryPoint.replace(/^\.\//, ""));
  const entry = entryMeta.get(entryPoint);
  if (!entry) continue;
  manifest[entry.basename] = path.basename(outfile);
}

if (!manifest["app.mjs"]) {
  throw new Error("Failed to locate bundled app.mjs output in manifest");
}
if (!manifest["styles.css"]) {
  throw new Error("Failed to locate bundled styles.css output in manifest");
}

const manifestPath = path.join(distDir, "manifest.json");
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const template = await fs.readFile(templatePath, "utf8");
const html = template
  .replace(/\{\{\s*app_js\s*\}\}/g, `./${manifest["app.mjs"]}`)
  .replace(/\{\{\s*styles_css\s*\}\}/g, `./${manifest["styles.css"]}`);

await fs.writeFile(path.join(distDir, "index.html"), html);

console.log(`Built onebox static bundle -> ${path.relative(process.cwd(), distDir)}`);
console.log(`Manifest written to ${path.relative(process.cwd(), manifestPath)}`);
