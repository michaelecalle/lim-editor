import type { LigneFTNormalized } from "../../types/ligneFTNormalized";
import type { LigneFtArchiveItem, LigneFtPublishDiagnostic } from "../../types/ligneft-api";
import {
  ACTIVE_FILE_PATH,
  ACTIVE_JSON_FILE_PATH,
  LIM2_ACTIVE_FILE_PATH,
  LIM2_ACTIVE_JSON_FILE_PATH,
  ARCHIVES_DIR_PATH,
  MAX_ARCHIVES,
} from "./constants.js";
import {
  LigneFtArchiveNotFoundError,
  LigneFtGithubError,
} from "./errors.js";
import {
  githubDeleteFile,
  githubGetFile,
  githubListDirectory,
  githubPutFile,
} from "./github.js";
import {
  buildNormalizedTsFile,
  normalizeNormalizedDataForBackwardCompatibility,
  parseAndValidateNormalizedTs,
} from "./serialization.js";
import {
  buildArchiveFilename,
  extractTimestampFromArchiveName,
  isArchiveFilename,
  sortArchivesNewestFirst,
} from "./timestamps.js";
import { assertValidNormalizedData } from "./validation.js";

function parseAndValidateArchiveJson(content: string): LigneFTNormalized {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Invalid archive JSON content${
        error instanceof Error && error.message ? `: ${error.message}` : ""
      }`,
    );
  }

  const normalized = normalizeNormalizedDataForBackwardCompatibility(parsed);
  assertValidNormalizedData(normalized);
  return normalized;
}

function buildArchiveJsonFile(data: LigneFTNormalized): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

async function loadOptionalGithubFileSha(
  path: string,
  target: "editor" | "lim2" = "editor",
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

export async function loadActiveFile(): Promise<{
  name: string;
  path: string;
  sha: string;
  content: string;
  data: LigneFTNormalized;
}> {
  const file = await githubGetFile(ACTIVE_FILE_PATH, "editor");
  const data = parseAndValidateNormalizedTs(file.content);

  return {
    name: file.name,
    path: file.path,
    sha: file.sha,
    content: file.content,
    data,
  };
}

export async function listArchives(): Promise<LigneFtArchiveItem[]> {
  let entries: Awaited<ReturnType<typeof githubListDirectory>>;

  try {
    entries = await githubListDirectory(ARCHIVES_DIR_PATH, "editor");
  } catch (error) {
    if (
      error instanceof LigneFtGithubError &&
      typeof error.details === "object" &&
      error.details !== null &&
      "message" in error.details &&
      (error.details as { message?: unknown }).message === "Not Found"
    ) {
      return [];
    }

    throw error;
  }

  const archiveItems: LigneFtArchiveItem[] = entries
    .filter((entry) => entry.type === "file" && isArchiveFilename(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      sha: entry.sha,
      size: entry.size ?? 0,
      timestamp: extractTimestampFromArchiveName(entry.name),
    }));

  return sortArchivesNewestFirst(archiveItems);
}

export async function loadArchive(name: string): Promise<{
  name: string;
  path: string;
  sha: string;
  content: string;
  data: LigneFTNormalized;
}> {
  if (!isArchiveFilename(name)) {
    throw new LigneFtArchiveNotFoundError(`Invalid archive name: ${name}`, name);
  }

  const path = `${ARCHIVES_DIR_PATH}/${name}`;

  try {
    const file = await githubGetFile(path, "editor");
    const data = parseAndValidateArchiveJson(file.content);

    return {
      name: file.name,
      path: file.path,
      sha: file.sha,
      content: file.content,
      data,
    };
  } catch (error) {
    if (
      error instanceof LigneFtGithubError &&
      typeof error.details === "object" &&
      error.details !== null &&
      "message" in error.details &&
      (error.details as { message?: unknown }).message === "Not Found"
    ) {
      throw new LigneFtArchiveNotFoundError(`Archive not found: ${name}`, name);
    }

    throw error;
  }
}

export async function createArchiveFromActiveFile(date = new Date()): Promise<{
  name: string;
  path: string;
  sha: string;
}> {
  const activeFile = await loadActiveFile();
  const archiveName = buildArchiveFilename(date);
  const archivePath = `${ARCHIVES_DIR_PATH}/${archiveName}`;
  const archiveContent = buildArchiveJsonFile(activeFile.data);

  const result = await githubPutFile(
    archivePath,
    archiveContent,
    `Archive active ligneFT.normalized.ts as ${archiveName}`,
    undefined,
    "editor",
  );

  return {
    name: archiveName,
    path: result.path,
    sha: result.sha,
  };
}

export async function purgeOldArchives(
  limit = MAX_ARCHIVES,
): Promise<string[]> {
  const archives = await listArchives();

  if (archives.length <= limit) {
    return [];
  }

  const archivesToDelete = archives.slice(limit);
  const deletedNames: string[] = [];

  for (const archive of archivesToDelete) {
    await githubDeleteFile(
      archive.path,
      `Delete old ligneFT archive ${archive.name}`,
      archive.sha,
      "editor",
    );
    deletedNames.push(archive.name);
  }

  return deletedNames;
}

export async function publishNormalizedData(
  data: unknown,
): Promise<LigneFtPublishDiagnostic> {
  assertValidNormalizedData(data);

  const normalizedData = data as LigneFTNormalized;
  const activeFile = await githubGetFile(ACTIVE_FILE_PATH, "editor");
  const activeJsonFileSha = await loadOptionalGithubFileSha(
    ACTIVE_JSON_FILE_PATH,
    "editor",
  );
  const lim2TsFileSha = await loadOptionalGithubFileSha(
    LIM2_ACTIVE_FILE_PATH,
    "lim2",
  );
  const lim2JsonFileSha = await loadOptionalGithubFileSha(
    LIM2_ACTIVE_JSON_FILE_PATH,
    "lim2",
  );

  const archiveCreated = await createArchiveFromActiveFile();
  const nextTsContent = buildNormalizedTsFile(normalizedData);
  const nextJsonContent = buildArchiveJsonFile(normalizedData);

  await githubPutFile(
    ACTIVE_FILE_PATH,
    nextTsContent,
    "Publish updated ligneFT.normalized.ts",
    activeFile.sha,
    "editor",
  );

  await githubPutFile(
    ACTIVE_JSON_FILE_PATH,
    nextJsonContent,
    "Publish updated ligneFT.normalized.json",
    activeJsonFileSha ?? undefined,
    "editor",
  );

  await githubPutFile(
    LIM2_ACTIVE_FILE_PATH,
    nextTsContent,
    "Publish updated ligneFT.normalized.ts for LIM2",
    lim2TsFileSha ?? undefined,
    "lim2",
  );

  await githubPutFile(
    LIM2_ACTIVE_JSON_FILE_PATH,
    nextJsonContent,
    "Publish updated ligneFT.normalized.json for LIM2",
    lim2JsonFileSha ?? undefined,
    "lim2",
  );

  const purgedArchives = await purgeOldArchives(MAX_ARCHIVES);

  return {
    publishedPath: ACTIVE_FILE_PATH,
    publishedJsonPath: ACTIVE_JSON_FILE_PATH,
    publishedLim2JsonPath: LIM2_ACTIVE_JSON_FILE_PATH,
    archiveCreated: {
      name: archiveCreated.name,
      path: archiveCreated.path,
    },
    purgedArchives,
  };
}