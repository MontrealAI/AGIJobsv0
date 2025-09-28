#!/usr/bin/env node
import { build } from "esbuild";
import { createHash } from "node:crypto";
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

const manifestEntries = [];
for (const [outfile, output] of Object.entries(result.metafile.outputs)) {
  if (!output.entryPoint) continue;
  const entryPoint = posix(output.entryPoint.replace(/^\.\//, ""));
  const entry = entryMeta.get(entryPoint);
  if (!entry) continue;
  manifestEntries.push({
    basename: entry.basename,
    outfile,
  });
}

if (!manifestEntries.some(({ basename }) => basename === "app.mjs")) {
  throw new Error("Failed to locate bundled app.mjs output in manifest");
}
if (!manifestEntries.some(({ basename }) => basename === "styles.css")) {
  throw new Error("Failed to locate bundled styles.css output in manifest");
}

const computeIntegrity = async (filePath) => {
  const fileBuffer = await fs.readFile(filePath);
  const sha384 = createHash("sha384").update(fileBuffer).digest("base64");
  const sha512 = createHash("sha512").update(fileBuffer).digest("base64");
  return {
    sha384: `sha384-${sha384}`,
    sha512: `sha512-${sha512}`,
  };
};

const manifest = {};
for (const { basename, outfile } of manifestEntries) {
  const absoluteOutfile = path.isAbsolute(outfile)
    ? outfile
    : path.join(appDir, outfile);
  const integrity = await computeIntegrity(absoluteOutfile);
  manifest[basename] = {
    file: path.basename(outfile),
    integrity,
  };
}

const manifestPath = path.join(distDir, "manifest.json");
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const template = await fs.readFile(templatePath, "utf8");
const scriptEntry = manifest["app.mjs"];
const stylesEntry = manifest["styles.css"];

const formatIntegrityAttribute = (entry) =>
  `${entry.integrity.sha384} ${entry.integrity.sha512}`;

const html = template
  .replace(/\{\{\s*app_js_src\s*\}\}/g, `./${scriptEntry.file}`)
  .replace(
    /\{\{\s*app_js_integrity\s*\}\}/g,
    formatIntegrityAttribute(scriptEntry),
  )
  .replace(/\{\{\s*styles_css_href\s*\}\}/g, `./${stylesEntry.file}`)
  .replace(
    /\{\{\s*styles_css_integrity\s*\}\}/g,
    formatIntegrityAttribute(stylesEntry),
  );

await fs.writeFile(path.join(distDir, "index.html"), html);

console.log(`Built onebox static bundle -> ${path.relative(process.cwd(), distDir)}`);
console.log(`Manifest written to ${path.relative(process.cwd(), manifestPath)}`);
