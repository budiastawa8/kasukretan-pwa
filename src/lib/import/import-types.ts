export type ImportIssue = {
  sheet: string;
  excelRow: number;
  column?: string;
  message: string;
};

export type ImportSheetSummary = {
  sheet: string;
  creates: number;
  updates: number;
  errors: number;
  warnings: number;
};

export type ImportPreviewResult<TOp = unknown> = {
  filename: string;
  canCommit: boolean;
  summaries: ImportSheetSummary[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  operations: TOp[];
};
