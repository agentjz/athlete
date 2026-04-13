export { readDocxDocument } from "./read.js";
export { buildDocxBuffer, parseDocxSource, renderDocxSourcePreview } from "./markdown.js";
export {
  convertHtmlToDocxBlocks,
  findSectionRange,
  normalizeHeading,
  renderDocxBlocksToMarkdown,
  summarizeDocxSections,
} from "./structure.js";
export { applyTemplateVariables, extractTemplateVariables } from "./template.js";
export type {
  DocxBlock,
  DocxMessage,
  DocxOutlineItem,
  DocxReadData,
  DocxSectionSummary,
  DocxSourceFormat,
  DocxWriteOptions,
} from "./types.js";
