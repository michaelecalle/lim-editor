// Publication du normalisé 2026 vers le repo lim-editor (GitHub), fichier
// SÉPARÉ de l'ancien format (cohabitation temporaire, cf. constants.ts).
// Réutilise le bas niveau GitHub générique de l'ancien pipeline (`../ligneft/
// github.ts`, `../ligneft/errors.ts` — aucune logique spécifique à l'ancien
// format là-dedans, donc pas dupliqué) ; seule l'orchestration (chemins,
// archivage) est propre au 2026.
import {
  githubGetFile,
  githubGetFileSha,
  githubListDirectory,
  githubPutFile,
  githubDeleteFile,
  githubGetLastCommitDate,
} from "../ligneft/github.js";
import { LigneFtGithubError, LigneFtValidationError } from "../ligneft/errors.js";
import {
  ACTIVE_2026_JSON_FILE_PATH,
  ARCHIVES_2026_DIR_PATH,
  MAX_ARCHIVES_2026,
} from "./constants.js";
import {
  buildArchiveFilename2026,
  isArchiveFilename2026,
  sortArchivesNewestFirst2026,
} from "./timestamps.js";

// Validation légère — le format 2026 n'a pas (encore) de schéma strict comme
// l'ancien (`../ligneft/validation.ts`) ; on vérifie juste la forme minimale
// pour éviter de publier n'importe quoi par erreur.
function assertValid2026Data(data: unknown): asserts data is Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new LigneFtValidationError("Le document normalisé 2026 doit être un objet.");
  }
  const d = data as Record<string, unknown>;
  if (d.formatVersion !== "2026") {
    throw new LigneFtValidationError('Le document doit avoir formatVersion: "2026".');
  }
  if (!d.trains || typeof d.trains !== "object") {
    throw new LigneFtValidationError('Le document doit avoir un champ "trains".');
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof LigneFtGithubError &&
    typeof error.details === "object" &&
    error.details !== null &&
    "message" in error.details &&
    (error.details as { message?: unknown }).message === "Not Found"
  );
}

async function listArchives2026(): Promise<Array<{ name: string; path: string; sha: string }>> {
  let entries: Awaited<ReturnType<typeof githubListDirectory>>;
  try {
    entries = await githubListDirectory(ARCHIVES_2026_DIR_PATH, "editor");
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw error;
  }
  const items = entries
    .filter((e) => e.type === "file" && isArchiveFilename2026(e.name))
    .map((e) => ({ name: e.name, path: e.path, sha: e.sha }));
  return sortArchivesNewestFirst2026(items);
}

async function purgeOldArchives2026(limit = MAX_ARCHIVES_2026): Promise<string[]> {
  const archives = await listArchives2026();
  if (archives.length <= limit) return [];
  const toDelete = archives.slice(limit);
  const deleted: string[] = [];
  for (const archive of toDelete) {
    await githubDeleteFile(archive.path, `Delete old ligneFT2026 archive ${archive.name}`, archive.sha, "editor");
    deleted.push(archive.name);
  }
  return deleted;
}

export type Publish2026Diagnostic = {
  publishedPath: string;
  archiveCreated: { name: string; path: string } | null;
  purgedArchives: string[];
};

export async function publish2026NormalizedData(data: unknown): Promise<Publish2026Diagnostic> {
  assertValid2026Data(data);
  const nextContent = `${JSON.stringify(data, null, 2)}\n`;

  // Archive du contenu PRÉCÉDENT avant écrasement — absent au tout premier
  // publish (rien à archiver), géré silencieusement.
  let archiveCreated: { name: string; path: string } | null = null;
  let activeSha: string | undefined;
  try {
    const activeFile = await githubGetFile(ACTIVE_2026_JSON_FILE_PATH, "editor");
    activeSha = activeFile.sha;
    const archiveName = buildArchiveFilename2026(new Date());
    const archivePath = `${ARCHIVES_2026_DIR_PATH}/${archiveName}`;
    const archiveResult = await githubPutFile(
      archivePath,
      activeFile.content,
      `Archive active ligneFT2026.normalized.json as ${archiveName}`,
      undefined,
      "editor"
    );
    archiveCreated = { name: archiveName, path: archiveResult.path };
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    // Pas de fichier actif encore — 1er publish, rien à archiver.
    activeSha = (await githubGetFileSha(ACTIVE_2026_JSON_FILE_PATH, "editor")) ?? undefined;
  }

  await githubPutFile(
    ACTIVE_2026_JSON_FILE_PATH,
    nextContent,
    "Publish updated ligneFT2026.normalized.json",
    activeSha,
    "editor"
  );

  const purgedArchives = await purgeOldArchives2026(MAX_ARCHIVES_2026);

  return { publishedPath: ACTIVE_2026_JSON_FILE_PATH, archiveCreated, purgedArchives };
}

export async function loadActive2026File(): Promise<{ data: unknown; publishedAt: string | null }> {
  const file = await githubGetFile(ACTIVE_2026_JSON_FILE_PATH, "editor");
  const data = JSON.parse(file.content) as unknown;
  const publishedAt = await githubGetLastCommitDate(ACTIVE_2026_JSON_FILE_PATH, "editor");
  return { data, publishedAt };
}
