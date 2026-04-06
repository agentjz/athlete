import type { DocxBlock, DocxSectionSummary } from "./types.js";

export function convertHtmlToDocxBlocks(html: string): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  const pattern = /<(h[1-6]|p|table|ul|ol|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi;

  for (const match of html.matchAll(pattern)) {
    const tag = (match[1] ?? "").toLowerCase();
    const innerHtml = match[2] ?? "";

    if (/^h[1-6]$/.test(tag)) {
      const headingLevel = Number.parseInt(tag.slice(1), 10);
      const text = stripHtml(innerHtml);
      if (text) {
        blocks.push({
          kind: "paragraph",
          text,
          headingLevel,
        });
      }
      continue;
    }

    if (tag === "p") {
      const text = stripHtml(innerHtml);
      if (text) {
        blocks.push({
          kind: "paragraph",
          text,
        });
      }
      continue;
    }

    if (tag === "pre") {
      const code = decodeHtmlEntities(innerHtml).replace(/\r/g, "");
      for (const line of code.split("\n")) {
        blocks.push({
          kind: "paragraph",
          text: line,
          code: true,
        });
      }
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const items = [...innerHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
      items.forEach((item, index) => {
        const text = stripHtml(item[1] ?? "");
        if (!text) {
          return;
        }

        blocks.push({
          kind: "paragraph",
          text: tag === "ol" ? `${index + 1}. ${text}` : `- ${text}`,
        });
      });
      continue;
    }

    if (tag === "table") {
      const rows = [...innerHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map((row) =>
          [...(row[1] ?? "").matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
            .map((cell) => stripHtml(cell[1] ?? ""))
            .filter((cell) => cell.length > 0),
        )
        .filter((row) => row.length > 0);

      if (rows.length > 0) {
        blocks.push({
          kind: "table",
          rows: normalizeTableRows(rows),
        });
      }
    }
  }

  return blocks;
}

export function renderDocxBlocksToMarkdown(blocks: DocxBlock[]): string {
  const lines: string[] = [];
  let inCodeFence = false;

  const flushCodeFence = (): void => {
    if (inCodeFence) {
      lines.push("```");
      lines.push("");
      inCodeFence = false;
    }
  };

  for (const block of blocks) {
    if (block.kind === "table") {
      flushCodeFence();
      if (block.rows.length === 0) {
        continue;
      }

      const rows = normalizeTableRows(block.rows);
      const header = rows[0] ?? [];
      lines.push(`| ${header.join(" | ")} |`);
      lines.push(`| ${header.map(() => "---").join(" | ")} |`);

      for (const row of rows.slice(1)) {
        lines.push(`| ${row.join(" | ")} |`);
      }

      lines.push("");
      continue;
    }

    if (block.code) {
      if (!inCodeFence) {
        lines.push("```");
        inCodeFence = true;
      }
      lines.push(block.text);
      continue;
    }

    flushCodeFence();

    if (block.headingLevel) {
      lines.push(`${"#".repeat(Math.max(1, Math.min(6, block.headingLevel)))} ${block.text}`);
      lines.push("");
      continue;
    }

    lines.push(block.text);
    lines.push("");
  }

  flushCodeFence();
  return lines.join("\n").trim();
}

export function summarizeDocxSections(blocks: DocxBlock[]): DocxSectionSummary[] {
  const sections: DocxSectionSummary[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block?.kind !== "paragraph" || !block.headingLevel) {
      continue;
    }

    const nextHeadingIndex = findNextSectionBoundary(blocks, index, block.headingLevel);
    const preview = blocks
      .slice(index + 1, nextHeadingIndex)
      .filter((item): item is Extract<DocxBlock, { kind: "paragraph" }> => item.kind === "paragraph")
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 200);

    sections.push({
      heading: block.text,
      level: block.headingLevel,
      preview,
    });
  }

  return sections;
}

export function findSectionRange(
  blocks: DocxBlock[],
  heading: string,
): { headingIndex: number; bodyStart: number; endIndex: number; level: number } | null {
  const normalizedTarget = normalizeHeading(heading);

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block?.kind !== "paragraph" || !block.headingLevel) {
      continue;
    }

    if (normalizeHeading(block.text) !== normalizedTarget) {
      continue;
    }

    return {
      headingIndex: index,
      bodyStart: index + 1,
      endIndex: findNextSectionBoundary(blocks, index, block.headingLevel),
      level: block.headingLevel,
    };
  }

  return null;
}

export function normalizeHeading(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function findNextSectionBoundary(blocks: DocxBlock[], startIndex: number, level: number): number {
  for (let index = startIndex + 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block?.kind === "paragraph" && block.headingLevel && block.headingLevel <= level) {
      return index;
    }
  }

  return blocks.length;
}

function normalizeTableRows(rows: string[][]): string[][] {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.map((row) => [...row, ...Array.from({ length: columnCount - row.length }, () => "")]);
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    replaceAnchors(value)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function replaceAnchors(value: string): string {
  return value.replace(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_match, _quote, href, label) => {
    const text = stripTags(label).replace(/\s+/g, " ").trim() || String(href);
    return `[${text}](${decodeHtmlEntities(String(href))})`;
  });
}

function stripTags(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
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
