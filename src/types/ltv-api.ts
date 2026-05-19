export type LtvPublishDiagnostic = {
  publishedJsonPath: string;
  publishedLim2JsonPath: string;
  publishedAt: string;
  rowCount: number;
  warnings: string[];
};

export type LtvPublishResponse = {
  ok: true;
  diagnostic: LtvPublishDiagnostic;
};

export type LtvErrorCode =
  | "INVALID_REQUEST"
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "GITHUB_ERROR"
  | "INTERNAL_ERROR";

export type LtvErrorResponse = {
  ok: false;
  error: {
    code: LtvErrorCode;
    message: string;
    details?: unknown;
  };
};

export type LtvPublishRequestBody = {
  data: unknown;
};