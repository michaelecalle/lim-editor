import { githubGetFile, githubGetLastCommitDate } from "../../src/lib/ligneft/github.js";
import { LigneFtConfigurationError, LigneFtGithubError } from "../../src/lib/ligneft/errors.js";
import { ACTIVE_2026_JSON_FILE_PATH } from "../../src/lib/ligneft2026/constants.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      // Lecture publique (données non sensibles) depuis un autre domaine — LIM2
      // consomme cette route directement (cf. mémoire projet "LIM lit le 2026 en ligne").
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Lit le normalisé 2026 publié (repo lim-editor, chemin SÉPARÉ de l'ancien
// format — cohabitation temporaire, cf. src/lib/ligneft2026/constants.ts).
export async function GET(): Promise<Response> {
  try {
    const file = await githubGetFile(ACTIVE_2026_JSON_FILE_PATH, "editor");

    let data: unknown;
    try {
      data = JSON.parse(file.content);
    } catch {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_JSON", message: "ligneFT2026.normalized.json n'est pas un JSON valide." } },
        502
      );
    }

    const publishedAt = await githubGetLastCommitDate(ACTIVE_2026_JSON_FILE_PATH, "editor");

    return jsonResponse({ ok: true, data, publishedAt });
  } catch (error) {
    if (error instanceof LigneFtConfigurationError) {
      return jsonResponse({ ok: false, error: { code: "CONFIGURATION_ERROR", message: error.message } }, 500);
    }
    if (error instanceof LigneFtGithubError) {
      // Inclut le cas "fichier absent" (aucun publish 2026 encore effectué).
      return jsonResponse({ ok: false, error: { code: "GITHUB_ERROR", message: error.message, details: error.details } }, 502);
    }
    return jsonResponse(
      { ok: false, error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Erreur interne" } },
      500
    );
  }
}
