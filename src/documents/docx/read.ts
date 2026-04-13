import fs from "node:fs/promises";

import mammoth from "mammoth";

import { convertHtmlToDocxBlocks, renderDocxBlocksToMarkdown, summarizeDocxSections } from "./structure.js";
import { extractTemplateVariables } from "./template.js";
import type { DocxMessage, DocxOutlineItem, DocxReadData } from "./types.js";

export async function readDocxDocument(filePath: string): Promise<DocxReadData> {
  const stat = await fs.stat(filePath);

  const [htmlResult, textResult] = await Promise.all([
    mammoth.convertToHtml({ path: filePath }),
    mammoth.extractRawText({ path: filePath }),
  ]);

  const html = htmlResult.value ?? "";
  const rawText = textResult.value ?? "";
  const blocks = convertHtmlToDocxBlocks(html);
  const outline = extractOutline(html);
  const messages = normalizeMessages([...htmlResult.messages, ...textResult.messages]);
  const markdownPreview = renderDocxBlocksToMarkdown(blocks);

  return {
    size: stat.size,
    rawText,
    html,
    messages,
    outline,
    sections: summarizeDocxSections(blocks),
    placeholders: extractTemplateVariables(rawText),
    markdownPreview,
    title: inferTitle(outline, rawText),
    statistics: {
      characters: rawText.length,
      paragraphs: countParagraphs(rawText),
      headings: outline.length,
      tables: countTag(html, "table"),
      links: countTag(html, "a"),
      images: countTag(html, "img"),
    },
  };
}

function normalizeMessages(messages: Array<{ type?: string; message?: string }>): DocxMessage[] {
  const seen = new Set<string>();
  const normalized: DocxMessage[] = [];

  for (const message of messages) {
    const type = (message.type ?? "info").trim() || "info";
    const text = (message.message ?? "").trim();
    if (!text) {
      continue;
    }

    const key = `${type}:${text}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push({
      type,
      message: text,
    });
  }

  return normalized;
}

function extractOutline(html: string): DocxOutlineItem[] {
  const outline: DocxOutlineItem[] = [];
  const pattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;

  for (const match of html.matchAll(pattern)) {
    const level = Number.parseInt(match[1] ?? "0", 10);
    const text = stripHtml(match[2] ?? "").trim();
    if (!text || !Number.isFinite(level) || level < 1 || level > 6) {
      continue;
    }

    outline.push({
      level,
      text,
    });
  }

  return outline;
}

function inferTitle(outline: DocxOutlineItem[], rawText: string): string | undefined {
  const firstHeading = outline.find((item) => item.level === 1)?.text ?? outline[0]?.text;
  if (firstHeading) {
    return firstHeading;
  }

  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?.slice(0, 200);
}

function countParagraphs(rawText: string): number {
  return rawText
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean).length;
}

function countTag(html: string, tag: string): number {
  const matches = html.match(new RegExp(`<${tag}\\b`, "gi"));
  return matches?.length ?? 0;
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}
