/** Shared types for chunked CSV import (companies + contacts). */

export interface CsvPreviewRow {
  /** Client-side stable key for React list editing before commit */
  _key: string;
  /** 1-based original CSV row number (header = 1) */
  rowNum: number;
  /** Field bag — keys are normalized column names */
  data: Record<string, string | null>;
  /** Validation messages for this row (empty = valid) */
  errors: string[];
  /** Soft warnings (e.g. will create new parent company) */
  warnings: string[];
}

export interface CsvPreviewResult {
  columns: string[];
  rows: CsvPreviewRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  exampleCsv: string;
}

export interface CsvChunkResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  /** True when this was the last chunk */
  done: boolean;
  processed: number;
  total: number;
}

export const DEFAULT_CHUNK_SIZE = 50;
