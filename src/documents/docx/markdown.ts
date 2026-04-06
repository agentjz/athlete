import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  type ParagraphChild,
} from "docx";

import type { DocxBlock, DocxSourceFormat, DocxWriteOptions } from "./types.js";

export async function buildDocxBuffer(options: DocxWriteOptions): Promise<Buffer> {
  const blocks = parseDocxSource(options.content, options.format);
  const children = blocks.map((block) => blockToDocxNode(block));
  const document = new Document({
    creator: options.creator ?? "Athlete",
    title: options.title,
    description: options.description,
    sections: [
      {
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

export function renderDocxSourcePreview(content: string, format: DocxSourceFormat): string {
  const blocks = parseDocxSource(content, format);
  const lines: string[] = [];

  for (const block of blocks) {
    if (block.kind === "table") {
      lines.push(...block.rows.map((row) => row.join(" | ")));
      lines.push("");
      continue;
    }

    lines.push(block.text);
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function parseDocxSource(content: string, format: DocxSourceFormat): DocxBlock[] {
  return format === "markdown" ? parseMarkdownBlocks(content) : parsePlainTextBlocks(content);
}

function parsePlainTextBlocks(content: string): DocxBlock[] {
  return content
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      kind: "paragraph" as const,
      text: block.replace(/\r?\n/g, "\n"),
    }));
}

function parseMarkdownBlocks(content: string): DocxBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: DocxBlock[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = (): void => {
    const text = paragraphLines.join(" ").trim();
    if (text) {
      blocks.push({
        kind: "paragraph",
        text,
      });
    }
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushParagraph();
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !/^```/.test((lines[index] ?? "").trim())) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (codeLines.length === 0) {
        blocks.push({
          kind: "paragraph",
          text: "",
          code: true,
        });
      } else {
        for (const codeLine of codeLines) {
          blocks.push({
            kind: "paragraph",
            text: codeLine,
            code: true,
          });
        }
      }

      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        kind: "paragraph",
        text: headingMatch[2]?.trim() ?? "",
        headingLevel: headingMatch[1]?.length ?? 1,
      });
      continue;
    }

    if (isMarkdownTableLine(trimmed)) {
      const tableLines = [trimmed];
      let cursor = index + 1;

      while (cursor < lines.length && isMarkdownTableLine((lines[cursor] ?? "").trim())) {
        tableLines.push((lines[cursor] ?? "").trim());
        cursor += 1;
      }

      const rows = parseMarkdownTable(tableLines);
      if (rows.length > 0) {
        flushParagraph();
        blocks.push({
          kind: "table",
          rows,
        });
        index = cursor - 1;
        continue;
      }
    }

    const bulletMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      blocks.push({
        kind: "paragraph",
        text: `${"  ".repeat(Math.floor((bulletMatch[1]?.length ?? 0) / 2))}- ${bulletMatch[2]?.trim() ?? ""}`,
      });
      continue;
    }

    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      blocks.push({
        kind: "paragraph",
        text:
          `${"  ".repeat(Math.floor((orderedMatch[1]?.length ?? 0) / 2))}` +
          `${orderedMatch[2]}. ${orderedMatch[3]?.trim() ?? ""}`,
      });
      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph();
  return blocks;
}

function isMarkdownTableLine(line: string): boolean {
  return line.includes("|") && !/^[-*+]\s+/.test(line) && !/^\d+\.\s+/.test(line);
}

function parseMarkdownTable(lines: string[]): string[][] {
  const rows = lines
    .map(parsePipeRow)
    .filter((row) => row.length > 1);

  if (rows.length === 0) {
    return [];
  }

  const separatorIndex =
    rows.length > 1 && rows[1]?.every((cell) => /^:?-{3,}:?$/.test(cell.trim())) ? 1 : -1;
  const filtered = separatorIndex === -1 ? rows : rows.filter((_, index) => index !== separatorIndex);

  if (filtered.length === 0) {
    return [];
  }

  const columnCount = filtered.reduce((max, row) => Math.max(max, row.length), 0);
  return filtered.map((row) => padRow(row, columnCount));
}

function parsePipeRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function padRow(row: string[], columnCount: number): string[] {
  if (row.length >= columnCount) {
    return row;
  }

  return [...row, ...Array.from({ length: columnCount - row.length }, () => "")];
}

function blockToDocxNode(block: DocxBlock): Paragraph | Table {
  if (block.kind === "table") {
    return new Table({
      rows: block.rows.map((row) =>
        new TableRow({
          children: row.map((cell) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: inlineTextToChildren(cell),
                }),
              ],
            }),
          ),
        }),
      ),
    });
  }

  return new Paragraph({
    heading: block.headingLevel ? mapHeadingLevel(block.headingLevel) : undefined,
    children: block.code
      ? [new TextRun({ text: block.text || " ", font: "Consolas" })]
      : inlineTextToChildren(block.text),
  });
}

function inlineTextToChildren(text: string): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const matched = match[0] ?? "";
    const index = match.index ?? 0;
    appendTextRun(children, text.slice(lastIndex, index));

    if (match[1] && match[2]) {
      children.push(
        new ExternalHyperlink({
          link: match[2],
          children: [
            new TextRun({
              text: match[1],
              style: "Hyperlink",
            }),
          ],
        }),
      );
    } else if (match[3]) {
      children.push(
        new TextRun({
          text: match[3],
          bold: true,
        }),
      );
    } else if (match[4]) {
      children.push(
        new TextRun({
          text: match[4],
          font: "Consolas",
        }),
      );
    } else if (match[5]) {
      children.push(
        new TextRun({
          text: match[5],
          italics: true,
        }),
      );
    }

    lastIndex = index + matched.length;
  }

  appendTextRun(children, text.slice(lastIndex));

  if (children.length === 0) {
    children.push(
      new TextRun({
        text: "",
      }),
    );
  }

  return children;
}

function appendTextRun(children: ParagraphChild[], text: string): void {
  if (!text) {
    return;
  }

  children.push(
    new TextRun({
      text,
    }),
  );
}

function mapHeadingLevel(level: number) {
  switch (Math.max(1, Math.min(6, level))) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    case 5:
      return HeadingLevel.HEADING_5;
    default:
      return HeadingLevel.HEADING_6;
  }
}
