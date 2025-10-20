import { mkdir, readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";
import path from "path";

export interface ManifestEntry {
  path: string;
  sha256: string;
  bytes: number;
}

export interface ManifestDocument {
  generatedAt: string;
  root: string;
  files: number;
  entries: ManifestEntry[];
}

function getFallbackRoot(manifestPath: string): string {
  const manifestDir = path.dirname(path.resolve(manifestPath));
  return path.resolve(manifestDir, "..", "..", "..");
}

export async function readManifest(manifestPath: string): Promise<ManifestDocument | undefined> {
  const absoluteManifestPath = path.resolve(manifestPath);

  try {
    const raw = await readFile(absoluteManifestPath, "utf8");
    const document = JSON.parse(raw) as ManifestDocument;
    if (!document || !Array.isArray(document.entries)) {
      throw new Error("Manifest missing entries array");
    }
    return document;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export interface UpdateManifestOptions {
  defaultRoot?: string;
}

export async function updateManifest(
  manifestPath: string,
  files: string[],
  options: UpdateManifestOptions = {},
): Promise<ManifestDocument> {
  if (files.length === 0) {
    const existing = await readManifest(manifestPath);
    if (!existing) {
      throw new Error("Manifest does not exist and no files provided");
    }
    return existing;
  }

  const absoluteManifestPath = path.resolve(manifestPath);
  const existing = await readManifest(absoluteManifestPath);
  const defaultRoot = options.defaultRoot ?? getFallbackRoot(absoluteManifestPath);
  const root = existing?.root ? path.resolve(existing.root) : defaultRoot;

  const entryMap = new Map<string, ManifestEntry>();
  if (existing) {
    for (const entry of existing.entries) {
      entryMap.set(entry.path, entry);
    }
  }

  for (const file of files) {
    const absolute = path.resolve(file);
    const buffer = await readFile(absolute);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const relative = path.relative(root, absolute) || path.relative(process.cwd(), absolute);
    entryMap.set(relative, {
      path: relative,
      sha256,
      bytes: buffer.byteLength,
    });
  }

  const entries = Array.from(entryMap.values()).sort((a, b) => a.path.localeCompare(b.path));
  const document: ManifestDocument = {
    generatedAt: new Date().toISOString(),
    root,
    files: entries.length,
    entries,
  };

  await mkdir(path.dirname(absoluteManifestPath), { recursive: true });
  await writeFile(absoluteManifestPath, JSON.stringify(document, null, 2), "utf8");

  return document;
}
