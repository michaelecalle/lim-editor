import type { LigneFTNormalized } from "../../types/ligneFTNormalized";
import type { LigneFtArchiveItem, LigneFtPublishDiagnostic } from "../../types/ligneft-api";
import {
  ACTIVE_FILE_PATH,
  ARCHIVES_DIR_PATH,
  MAX_ARCHIVES,
} from "./constants";
import {
  LigneFtArchiveNotFoundError,
  LigneFtGithubError,
} from "./errors";
import {
  githubDeleteFile,
  githubGetFile,
  githubListDirectory,
  githubPutFile,
} from "./github";
import {
  buildNormalizedTsFile,
  parseAndValidateNormalizedTs,
} from "./serialization";
import {
  buildArchiveFilename,
  extractTimestampFromArchiveName,
  isArchiveFilename,
  sortArchivesNewestFirst,
} from "./timestamps";
import { assertValidNormalizedData } from "./validation";

export async function loadActiveFile(): Promise<{
  name: string;
  path: string;
  sha: string;
  content: string;
  data: LigneFTNormalized;
}> {
  const file = await githubGetFile(ACTIVE_FILE_PATH);
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
    entries = await githubListDirectory(ARCHIVES_DIR_PATH);
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
    const file = await githubGetFile(path);
    const data = parseAndValidateNormalizedTs(file.content);

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

  const result = await githubPutFile(
    archivePath,
    activeFile.content,
    `Archive active ligneFT.normalized.ts as ${archiveName}`,
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
    );
    deletedNames.push(archive.name);
  }

  return deletedNames;
}

export async function publishNormalizedData(
  data: unknown,
): Promise<LigneFtPublishDiagnostic> {
  assertValidNormalizedData(data);

  const activeFile = await githubGetFile(ACTIVE_FILE_PATH);

  const archiveCreated = await createArchiveFromActiveFile();
  const nextContent = buildNormalizedTsFile(data);

  await githubPutFile(
    ACTIVE_FILE_PATH,
    nextContent,
    "Publish updated ligneFT.normalized.ts",
    activeFile.sha,
  );

  const purgedArchives = await purgeOldArchives(MAX_ARCHIVES);

  return {
    publishedPath: ACTIVE_FILE_PATH,
    archiveCreated: {
      name: archiveCreated.name,
      path: archiveCreated.path,
    },
    purgedArchives,
  };
}