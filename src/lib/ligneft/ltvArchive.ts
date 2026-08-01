import type { LtvPublishDiagnostic } from "../../types/ltv-api";
import {
  ACTIVE_LTV_JSON_FILE_PATH,
  LIM2_ACTIVE_LTV_JSON_FILE_PATH,
} from "./constants.js";
import { LigneFtGithubError, LigneFtValidationError } from "./errors.js";
import {
  githubGetFile,
  githubGetFileSha,
  githubPutBinaryFile,
  githubPutFile,
} from "./github.js";

// Fichier LTV canonique : lu par l'app cabine (runtime) ET par l'éditeur
// (/api/ltv/current). C'est LA source unique, dans le repo lim-logs (target "logs").
const LTV_CURRENT_LOGS_PATH = "ltv-normalized/current.json";

// PDF SOURCE LTV, déposé À CÔTÉ du normalisé. L'app cabine (LIM) l'affiche en mode
// secours (bascule fiche train ↔ LTV). Toujours « le plus récent par date de contenu ».
const LTV_CURRENT_PDF_LOGS_PATH = "ltv-normalized/current.pdf";

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

function isGithubNotFound(error: unknown): boolean {
  return (
    error instanceof LigneFtGithubError &&
    typeof error.details === "object" &&
    error.details !== null &&
    "message" in error.details &&
    (error.details as { message?: unknown }).message === "Not Found"
  );
}

async function loadOptionalGithubFileSha(
  path: string,
  target: "editor" | "lim2" = "editor"
): Promise<string | null> {
  try {
    const file = await githubGetFile(path, target);
    return file.sha;
  } catch (error) {
    if (isGithubNotFound(error)) {
      return null;
    }

    throw error;
  }
}

// Lecture 404-tolérante du normalisé canonique (repo logs) : {content, sha} ou null.
// Sert à comparer la Fecha Vigor (meta.publishedAt) stockée à celle qui entre.
async function loadOptionalLtvCurrentFromLogs(): Promise<{ content: string; sha: string } | null> {
  try {
    const file = await githubGetFile(LTV_CURRENT_LOGS_PATH, "logs");
    return { content: file.content, sha: file.sha };
  } catch (error) {
    if (isGithubNotFound(error)) {
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
): Promise<{ path: string; publishedAt: string; rowCount: number; warnings: string[]; written: boolean }> {
  assertValidLtvNormalizedData(data);

  // On préserve meta.publishedAt (date de vigueur du PDF, posée par le parseur) —
  // contrairement à la publication baked historique qui écrase avec l'heure d'upload.
  const publishedAt =
    typeof data.meta.publishedAt === "string" && data.meta.publishedAt.trim() !== ""
      ? data.meta.publishedAt
      : new Date().toISOString();

  const warnings = normalizeWarnings(data.warnings);
  const nextContent = `${JSON.stringify({ ...data, warnings }, null, 2)}\n`;

  // « Le plus récent par DATE DE CONTENU (Fecha Vigor) gagne », pas le plus récemment
  // envoyé. On ne réécrit que si la date entrante est STRICTEMENT plus récente que
  // celle du normalisé déjà stocké (ou s'il n'existe pas encore).
  const existing = await loadOptionalLtvCurrentFromLogs();
  let existingSha: string | undefined;
  if (existing) {
    existingSha = existing.sha;
    const newDate = Date.parse(publishedAt) || 0;
    let existingDate = 0;
    try {
      const parsed = JSON.parse(existing.content) as { meta?: { publishedAt?: string } };
      existingDate = Date.parse(parsed?.meta?.publishedAt ?? "") || 0;
    } catch {
      existingDate = 0;
    }
    if (newDate > 0 && existingDate > 0 && newDate <= existingDate) {
      // Déjà à jour (ou plus ancien) → on n'écrase pas.
      return { path: LTV_CURRENT_LOGS_PATH, publishedAt, rowCount: data.rows.length, warnings, written: false };
    }
  }

  const result = await githubPutFile(
    LTV_CURRENT_LOGS_PATH,
    nextContent,
    "Import LTV depuis l'editeur (PDF)",
    existingSha,
    "logs"
  );

  return {
    path: result.path,
    publishedAt,
    rowCount: data.rows.length,
    warnings,
    written: true,
  };
}

// Dépose le PDF source LTV (base64) à côté du normalisé. Il SUIT la décision de date
// du normalisé : `force` = le normalisé vient d'être (ré)écrit car sa Fecha Vigor est
// plus récente. On écrit le PDF si `force` OU s'il n'existe pas encore (rattrapage).
// Sinon on n'y touche pas → « le plus récent par date de contenu » reste en place.
// Best-effort côté appelant (fire-and-forget) : ne bloque pas la publication du LTV.
export async function publishLtvSourcePdfToLogs(
  base64Pdf: unknown,
  opts: { force: boolean }
): Promise<{ path: string; skipped: boolean }> {
  if (typeof base64Pdf !== "string" || base64Pdf.trim() === "") {
    throw new LigneFtValidationError("Le PDF source LTV (base64) est requis.");
  }
  const existingSha = await githubGetFileSha(LTV_CURRENT_PDF_LOGS_PATH, "logs");
  if (!opts.force && existingSha) {
    // Le normalisé n'a pas changé et le PDF est déjà là → rien à faire.
    return { path: LTV_CURRENT_PDF_LOGS_PATH, skipped: true };
  }
  const result = await githubPutBinaryFile(
    LTV_CURRENT_PDF_LOGS_PATH,
    base64Pdf,
    "Depot PDF source LTV depuis l'editeur",
    existingSha ?? undefined,
    "logs"
  );
  return { path: result.path, skipped: false };
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