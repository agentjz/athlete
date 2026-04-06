export type DocxSourceFormat = "plain_text" | "markdown";

export interface DocxMessage {
  type: string;
  message: string;
}

export interface DocxOutlineItem {
  level: number;
  text: string;
}

export interface DocxSectionSummary {
  heading: string;
  level: number;
  preview: string;
}

export interface DocxReadData {
  size: number;
  rawText: string;
  html: string;
  messages: DocxMessage[];
  outline: DocxOutlineItem[];
  sections: DocxSectionSummary[];
  placeholders: string[];
  markdownPreview: string;
  title?: string;
  statistics: {
    characters: number;
    paragraphs: number;
    headings: number;
    tables: number;
    links: number;
    images: number;
  };
}

export interface DocxWriteOptions {
  title?: string;
  description?: string;
  creator?: string;
  format: DocxSourceFormat;
  content: string;
}

export type DocxBlock =
  | {
      kind: "paragraph";
      text: string;
      headingLevel?: number;
      code?: boolean;
    }
  | {
      kind: "table";
      rows: string[][];
    };
