import type { LtvPublishDiagnostic } from "../../types/ltv-api";
import {
  ACTIVE_LTV_JSON_FILE_PATH,
  LIM2_ACTIVE_LTV_JSON_FILE_PATH,
} from "./constants.js";
import { LigneFtGithubError, LigneFtValidationError } from "./errors.js";
import { githubGetFile, githubGetFileSha, githubPutFile } from "./github.js";

// Fichier LTV canonique : lu par l'app cabine (runtime) ET par l'éditeur
// (/api/ltv/current). C'est LA source unique, dans le repo lim-logs (target "logs").
const LTV_CURRENT_LOGS_PATH = "ltv-normalized/current.json";

type LtvNormalizedPublishPayload = {
  meta: {
    line: string;
    publishedAt?: string;
    adif?: {
      source?: string;
      fetchedAt?: string;
      sourceUpdatedAt?: string | null;
      sourceUpdatedFile?: string | null;
    };
  };
  rows: unknown[];
  warnings?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertValidLtvNormalizedData(
  data: unknown
): asserts data is LtvNormalizedPublishPayload {
  if (!isRecord(data)) {
    throw new LigneFtValidationError("Le fichier LTV normalisé doit être un objet JSON.");
  }

  if (!isRecord(data.meta)) {
    throw new LigneFtValidationError("Le fichier LTV normalisé doit contenir un objet meta.");
  }

  if (typeof data.meta.line !== "string" || data.meta.line.trim() === "") {
    throw new LigneFtValidationError("Le fichier LTV normalisé doit contenir meta.line.");
  }

  if (!Array.isArray(data.rows)) {
    throw new LigneFtValidationError("Le fichier LTV normalisé doit contenir un tableau rows.");
  }

  if ("warnings" in data && !Array.isArray(data.warnings)) {
    throw new LigneFtValidationError("Le champ warnings du fichier LTV normalisé doit être un tableau.");
  }
}

async function loadOptionalGithubFileSha(
  path: string,
  target: "editor" | "lim2" = "editor"
): Promise<string | null> {
  try {
    const file = await githubGetFile(path, target);
    return file.sha;
  } catch (error) {
    if (
      error instanceof LigneFtGithubError &&
      typeof error.details === "object" &&
      error.details !== null &&
      "message" in error.details &&
      (error.details as { message?: unknown }).message === "Not Found"
    ) {
      return null;
    }

    throw error;
  }
}

function normalizeWarnings(warnings: unknown[] | undefined): string[] {
  if (!Array.isArray(warnings)) {
    return [];
  }

  return warnings
    .filter((warning): warning is string => typeof warning === "string")
    .map((warning) => warning.trim())
    .filter((warning) => warning !== "");
}

function buildLtvJsonFile(data: LtvNormalizedPublishPayload, publishedAt: string): string {
  const nextData = {
    ...data,
    meta: {
      ...data.meta,
      publishedAt,
    },
    warnings: normalizeWarnings(data.warnings),
  };

  return `${JSON.stringify(nextData, null, 2)}\n`;
}

// Écrit/écrase le fichier LTV canonique unique dans lim-logs (ltv-normalized/current.json).
// C'est le second chemin de mise à jour (le premier étant l'app cabine qui uploade
// le résultat du PDF). Ne touche PAS aux fichiers bakés éditeur/LIM2 : un seul fichier.
export async function publishLtvCurrentToLogs(
  data: unknown
): Promise<{ path: string; publishedAt: string; rowCount: number; warnings: string[] }> {
  assertValidLtvNormalizedData(data);

  // On préserve meta.publishedAt (date de vigueur du PDF, posée par le parseur) —
  // contrairement à la publication baked historique qui écrase avec l'heure d'upload.
  const publishedAt =
    typeof data.meta.publishedAt === "string" && data.meta.publishedAt.trim() !== ""
      ? data.meta.publishedAt
      : new Date().toISOString();

  const warnings = normalizeWarnings(data.warnings);
  const nextContent = `${JSON.stringify({ ...data, warnings }, null, 2)}\n`;

  const existingSha = await githubGetFileSha(LTV_CURRENT_LOGS_PATH, "logs");

  const result = await githubPutFile(
    LTV_CURRENT_LOGS_PATH,
    nextContent,
    "Import LTV depuis l'editeur (PDF)",
    existingSha ?? undefined,
    "logs"
  );

  return {
    path: result.path,
    publishedAt,
    rowCount: data.rows.length,
    warnings,
  };
}

export async function publishLtvNormalizedData(
  data: unknown
): Promise<LtvPublishDiagnostic> {
  assertValidLtvNormalizedData(data);

  const publishedAt = new Date().toISOString();
  const editorJsonFileSha = await loadOptionalGithubFileSha(
    ACTIVE_LTV_JSON_FILE_PATH,
    "editor"
  );
  const lim2JsonFileSha = await loadOptionalGithubFileSha(
    LIM2_ACTIVE_LTV_JSON_FILE_PATH,
    "lim2"
  );

  const nextJsonContent = buildLtvJsonFile(data, publishedAt);
  const warnings = normalizeWarnings(data.warnings);

  await githubPutFile(
    ACTIVE_LTV_JSON_FILE_PATH,
    nextJsonContent,
    "Publish updated ltv.normalized.json",
    editorJsonFileSha ?? undefined,
    "editor"
  );

  await githubPutFile(
    LIM2_ACTIVE_LTV_JSON_FILE_PATH,
    nextJsonContent,
    "Publish updated ltv.normalized.json for LIM2",
    lim2JsonFileSha ?? undefined,
    "lim2"
  );

  return {
    publishedJsonPath: ACTIVE_LTV_JSON_FILE_PATH,
    publishedLim2JsonPath: LIM2_ACTIVE_LTV_JSON_FILE_PATH,
    publishedAt,
    rowCount: data.rows.length,
    warnings,
  };
}