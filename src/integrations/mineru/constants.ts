export type MineruDocumentCategory = "pdf" | "image" | "doc" | "ppt";

export const MINERU_MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MINERU_MAX_FILE_MB = 200;
export const MINERU_MAX_PAGES = 600;

export const MINERU_PDF_EXTENSIONS = [".pdf"] as const;
export const MINERU_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".jp2", ".webp", ".gif", ".bmp"] as const;
export const MINERU_DOC_EXTENSIONS = [".doc", ".docx"] as const;
export const MINERU_PPT_EXTENSIONS = [".ppt", ".pptx"] as const;

const CATEGORY_EXTENSIONS: Record<MineruDocumentCategory, readonly string[]> = {
  pdf: MINERU_PDF_EXTENSIONS,
  image: MINERU_IMAGE_EXTENSIONS,
  doc: MINERU_DOC_EXTENSIONS,
  ppt: MINERU_PPT_EXTENSIONS,
};

export function getMineruSupportedExtensions(category: MineruDocumentCategory): readonly string[] {
  return CATEGORY_EXTENSIONS[category];
}

export function isMineruSupportedExtension(
  category: MineruDocumentCategory,
  extension: string,
): boolean {
  return CATEGORY_EXTENSIONS[category].includes(extension as never);
}
