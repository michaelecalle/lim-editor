export class LigneFtValidationError extends Error {
  public readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "LigneFtValidationError";
    this.details = details;
  }
}

export class LigneFtGithubError extends Error {
  public readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "LigneFtGithubError";
    this.details = details;
  }
}

export class LigneFtArchiveNotFoundError extends Error {
  public readonly archiveName?: string;

  constructor(message: string, archiveName?: string) {
    super(message);
    this.name = "LigneFtArchiveNotFoundError";
    this.archiveName = archiveName;
  }
}

export class LigneFtConfigurationError extends Error {
  public readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "LigneFtConfigurationError";
    this.details = details;
  }
}