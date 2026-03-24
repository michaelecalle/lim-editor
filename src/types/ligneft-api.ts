export type LigneFtArchiveItem = {
  name: string;
  path: string;
  sha: string;
  size: number;
  timestamp: string | null;
};

export type LigneFtArchivesResponse = {
  ok: true;
  archives: LigneFtArchiveItem[];
};

export type LigneFtArchiveResponse = {
  ok: true;
  archive: {
    name: string;
    content: string;
    data: unknown;
  };
};

export type LigneFtPublishDiagnostic = {
  publishedPath: string;
  publishedJsonPath: string;
  publishedLim2JsonPath: string;
  archiveCreated: {
    name: string;
    path: string;
  };
  purgedArchives: string[];
};

export type LigneFtPublishResponse = {
  ok: true;
  diagnostic: LigneFtPublishDiagnostic;
};

export type LigneFtErrorCode =
  | "INVALID_REQUEST"
  | "VALIDATION_ERROR"
  | "ARCHIVE_NOT_FOUND"
  | "CONFIGURATION_ERROR"
  | "GITHUB_ERROR"
  | "INTERNAL_ERROR";

export type LigneFtErrorResponse = {
  ok: false;
  error: {
    code: LigneFtErrorCode;
    message: string;
    details?: unknown;
  };
};

export type LigneFtPublishRequestBody = {
  data: unknown;
};