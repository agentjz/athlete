export interface MineruBatchCreateInput {
  fileName: string;
  isOcr: boolean;
  language?: string;
  modelVersion?: string;
  enableTable?: boolean;
  enableFormula?: boolean;
}

export interface MineruBatchCreateResult {
  batchId: string;
  fileUrls: string[];
}

export interface MineruBatchResult {
  fileName: string;
  state: string;
  errMsg?: string;
  fullZipUrl?: string;
  fullMarkdownUrl?: string;
  extractedPages?: number;
  totalPages?: number;
}
