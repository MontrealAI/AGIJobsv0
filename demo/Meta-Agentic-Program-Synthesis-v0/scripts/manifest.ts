import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { createHash } from "crypto";

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

async function hashFile(filePath: string, root: string): Promise<ManifestEntry> {
  const absolute = path.resolve(filePath);
  const buffer = await readFile(absolute);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const relative = path.relative(root, absolute) || path.relative(process.cwd(), absolute) || path.basename(absolute);
  return {
    path: relative.replace(/\\/g, "/"),
    sha256,
    bytes: buffer.byteLength,
  };
}

export async function updateManifest(manifestPath: string, files: string[]): Promise<ManifestDocument> {
  const absoluteManifest = path.resolve(manifestPath);

  let document: ManifestDocument | undefined;
  try {
    const raw = await readFile(absoluteManifest, "utf8");
    document = JSON.parse(raw) as ManifestDocument;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const root = document?.root ? path.resolve(document.root) : process.cwd();
  const entries = new Map<string, ManifestEntry>();

  if (document) {
    for (const entry of document.entries) {
      entries.set(entry.path, entry);
    }
  }

  for (const file of files) {
    const entry = await hashFile(file, root);
    entries.set(entry.path, entry);
  }

  const next: ManifestDocument = {
    generatedAt: new Date().toISOString(),
    root,
    files: entries.size,
    entries: Array.from(entries.values()).sort((a, b) => a.path.localeCompare(b.path)),
  };

  await mkdir(path.dirname(absoluteManifest), { recursive: true });
  await writeFile(absoluteManifest, JSON.stringify(next, null, 2), "utf8");

  return next;
}
