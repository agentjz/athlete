import fs from "node:fs/promises";

import AdmZip from "adm-zip";

export interface ExtractedMineruMarkdown {
  entryName: string;
  markdown: string;
}

export async function extractMarkdownFromMineruArchive(archivePath: string): Promise<ExtractedMineruMarkdown> {
  const buffer = await fs.readFile(archivePath);
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const preferred = entries.find((entry) => normalizeEntryName(entry.entryName).endsWith("/full.md"))
    ?? entries.find((entry) => normalizeEntryName(entry.entryName) === "full.md")
    ?? entries.find((entry) => entry.entryName.toLowerCase().endsWith(".md"));

  if (!preferred) {
    throw new Error(`MinerU archive ${archivePath} does not contain any markdown file.`);
  }

  return {
    entryName: preferred.entryName,
    markdown: preferred.getData().toString("utf8"),
  };
}

export async function persistMineruArchive(options: {
  archiveBuffer: Buffer;
  archivePath: string;
  extractDir: string;
}): Promise<void> {
  await fs.mkdir(options.extractDir, { recursive: true });
  await fs.writeFile(options.archivePath, options.archiveBuffer);

  const zip = new AdmZip(options.archiveBuffer);
  zip.extractAllTo(options.extractDir, true);
}

function normalizeEntryName(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}
