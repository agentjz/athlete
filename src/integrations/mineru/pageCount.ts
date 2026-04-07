import fs from "node:fs/promises";

import AdmZip from "adm-zip";
import * as CFB from "cfb";

import {
  MINERU_DOC_EXTENSIONS,
  MINERU_IMAGE_EXTENSIONS,
  MINERU_PDF_EXTENSIONS,
  MINERU_PPT_EXTENSIONS,
} from "./constants.js";

const VT_I4 = 0x0003;
const VT_UI4 = 0x0013;
const SUMMARY_INFORMATION_PAGE_COUNT_PROPERTY = 0x000e;
const DOCUMENT_SUMMARY_INFORMATION_SLIDE_COUNT_PROPERTY = 0x0007;

export interface MineruPageCountProbe {
  value?: number;
  source: string;
}

export async function probeMineruPageCount(
  filePath: string,
  extension: string,
): Promise<MineruPageCountProbe> {
  try {
    if (MINERU_PDF_EXTENSIONS.includes(extension as never)) {
      return {
        value: await readPdfPageCount(filePath),
        source: "pdf_structure",
      };
    }

    if (MINERU_IMAGE_EXTENSIONS.includes(extension as never)) {
      return {
        value: 1,
        source: "single_image",
      };
    }

    if (extension === ".docx") {
      return {
        value: await readOpenXmlAppProperty(filePath, "Pages"),
        source: "openxml_pages",
      };
    }

    if (extension === ".pptx") {
      return {
        value: await readOpenXmlAppProperty(filePath, "Slides"),
        source: "openxml_slides",
      };
    }

    if (MINERU_DOC_EXTENSIONS.includes(extension as never)) {
      return {
        value: await readOlePropertyValue(filePath, "summary", SUMMARY_INFORMATION_PAGE_COUNT_PROPERTY),
        source: "ole_summary_information",
      };
    }

    if (MINERU_PPT_EXTENSIONS.includes(extension as never)) {
      return {
        value: await readOlePropertyValue(
          filePath,
          "document_summary",
          DOCUMENT_SUMMARY_INFORMATION_SLIDE_COUNT_PROPERTY,
        ),
        source: "ole_document_summary_information",
      };
    }
  } catch {
    return {
      value: undefined,
      source: "unavailable",
    };
  }

  return {
    value: undefined,
    source: "unsupported",
  };
}

async function readPdfPageCount(filePath: string): Promise<number | undefined> {
  const content = (await fs.readFile(filePath)).toString("latin1");
  const counts = [...content.matchAll(/\/Count\s+(\d+)\b/g)]
    .map((match) => Number.parseInt(match[1] ?? "", 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (counts.length > 0) {
    return Math.max(...counts);
  }

  const pageMatches = content.match(/\/Type\s*\/Page\b/g);
  if (!pageMatches || pageMatches.length === 0) {
    return undefined;
  }

  return pageMatches.length;
}

async function readOpenXmlAppProperty(
  filePath: string,
  propertyName: "Pages" | "Slides",
): Promise<number | undefined> {
  const zip = new AdmZip(await fs.readFile(filePath));
  const entry = zip.getEntry("docProps/app.xml");
  if (!entry) {
    return undefined;
  }

  const xml = entry.getData().toString("utf8");
  const match = xml.match(new RegExp(`<${propertyName}>(\\d+)</${propertyName}>`, "i"));
  if (!match) {
    return undefined;
  }

  return normalizePositiveInteger(Number.parseInt(match[1] ?? "", 10));
}

async function readOlePropertyValue(
  filePath: string,
  streamName: "summary" | "document_summary",
  propertyId: number,
): Promise<number | undefined> {
  const container = CFB.read(await fs.readFile(filePath), { type: "buffer" });
  const entry =
    streamName === "summary"
      ? CFB.find(container, "/!SummaryInformation") ?? CFB.find(container, "/\u0005SummaryInformation")
      : CFB.find(container, "/!DocumentSummaryInformation") ?? CFB.find(container, "/\u0005DocumentSummaryInformation");

  if (!entry?.content) {
    return undefined;
  }

  return parsePropertySetInteger(Buffer.from(entry.content), propertyId);
}

function parsePropertySetInteger(buffer: Buffer, propertyId: number): number | undefined {
  if (buffer.length < 48 || buffer.readUInt16LE(0) !== 0xfffe) {
    return undefined;
  }

  const setCount = buffer.readUInt32LE(28);
  if (setCount < 1) {
    return undefined;
  }

  const setOffset = buffer.readUInt32LE(44);
  if (setOffset + 8 > buffer.length) {
    return undefined;
  }

  const propertyCount = buffer.readUInt32LE(setOffset + 4);
  for (let index = 0; index < propertyCount; index += 1) {
    const entryOffset = setOffset + 8 + index * 8;
    if (entryOffset + 8 > buffer.length) {
      break;
    }

    const currentPropertyId = buffer.readUInt32LE(entryOffset);
    const valueOffset = buffer.readUInt32LE(entryOffset + 4);
    if (currentPropertyId !== propertyId) {
      continue;
    }

    const absoluteValueOffset = setOffset + valueOffset;
    if (absoluteValueOffset + 8 > buffer.length) {
      return undefined;
    }

    const valueType = buffer.readUInt32LE(absoluteValueOffset);
    if (valueType === VT_I4) {
      return normalizePositiveInteger(buffer.readInt32LE(absoluteValueOffset + 4));
    }

    if (valueType === VT_UI4) {
      return normalizePositiveInteger(buffer.readUInt32LE(absoluteValueOffset + 4));
    }
  }

  return undefined;
}

function normalizePositiveInteger(value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.trunc(value);
}
