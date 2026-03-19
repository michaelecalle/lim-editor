export function buildArchiveFilename(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `ligneFT.normalized.${year}-${month}-${day}T${hours}-${minutes}-${seconds}.ts`;
}

export function extractTimestampFromArchiveName(name: string): string | null {
  const match = name.match(
    /^ligneFT\.normalized\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.ts$/,
  );

  if (!match) {
    return null;
  }

  return match[1];
}

export function isArchiveFilename(name: string): boolean {
  return extractTimestampFromArchiveName(name) !== null;
}

export function sortArchivesNewestFirst<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTimestamp = extractTimestampFromArchiveName(a.name);
    const bTimestamp = extractTimestampFromArchiveName(b.name);

    if (!aTimestamp && !bTimestamp) return 0;
    if (!aTimestamp) return 1;
    if (!bTimestamp) return -1;

    return bTimestamp.localeCompare(aTimestamp);
  });
}