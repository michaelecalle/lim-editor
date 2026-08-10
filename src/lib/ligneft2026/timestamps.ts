// Nommage des archives 2026 — même principe que `../ligneft/timestamps.ts`
// (préfixe différent, pas réutilisable tel quel car le préfixe y est en dur).

export function buildArchiveFilename2026(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `ligneFT2026.normalized.${year}-${month}-${day}T${hours}-${minutes}-${seconds}.json`;
}

export function extractTimestampFromArchiveName2026(name: string): string | null {
  const match = name.match(
    /^ligneFT2026\.normalized\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.json$/
  );
  return match ? match[1] : null;
}

export function isArchiveFilename2026(name: string): boolean {
  return extractTimestampFromArchiveName2026(name) !== null;
}

export function sortArchivesNewestFirst2026<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTimestamp = extractTimestampFromArchiveName2026(a.name);
    const bTimestamp = extractTimestampFromArchiveName2026(b.name);
    if (!aTimestamp && !bTimestamp) return 0;
    if (!aTimestamp) return 1;
    if (!bTimestamp) return -1;
    return bTimestamp.localeCompare(aTimestamp);
  });
}
