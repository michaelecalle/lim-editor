// Client HTTP pour le normalisé 2026 (fichier SÉPARÉ de l'ancien format —
// cohabitation temporaire, cf. src/lib/ligneft2026/constants.ts). Même
// convention que `ligneftApi.ts` (ancien format).

function isErrorResponse(value: unknown): value is { ok: false; error: { code: string; message: string } } {
  if (typeof value !== "object" || value === null) return false;
  const c = value as { ok?: unknown; error?: { code?: unknown; message?: unknown } };
  return c.ok === false && typeof c.error?.code === "string" && typeof c.error?.message === "string";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("Réponse JSON invalide reçue du serveur.");
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  return isErrorResponse(payload) ? payload.error.message : fallback;
}

export async function fetchLigneFt2026Current(): Promise<{
  data: unknown;
  publishedAt: string | null;
  errorMessage: string | null;
}> {
  try {
    const response = await fetch("/api/ligneft2026/current", { method: "GET", cache: "no-store" });
    const payload = await readJson(response);
    if (!response.ok) {
      return { data: null, publishedAt: null, errorMessage: extractErrorMessage(payload, "Chargement échoué.") };
    }
    const p = payload as { data: unknown; publishedAt: string | null };
    return { data: p.data, publishedAt: p.publishedAt, errorMessage: null };
  } catch (error) {
    return {
      data: null,
      publishedAt: null,
      errorMessage: error instanceof Error ? error.message : "Erreur réseau inconnue.",
    };
  }
}

export async function publishLigneFt2026Data(
  data: unknown
): Promise<{ publishedPath: string; archiveCreated: { name: string; path: string } | null; purgedArchives: string[] }> {
  const response = await fetch("/api/ligneft2026/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ data }),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, "Impossible de publier le normalisé 2026."));
  }
  return (payload as { diagnostic: { publishedPath: string; archiveCreated: { name: string; path: string } | null; purgedArchives: string[] } }).diagnostic;
}
