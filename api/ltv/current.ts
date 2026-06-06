import { githubGetFile } from "../../src/lib/ligneft/github.js";
import {
  LigneFtConfigurationError,
  LigneFtGithubError,
} from "../../src/lib/ligneft/errors.js";

// Chemin du normalisé LTV uploadé par l'app cabine dans le repo lim-logs (privé).
const LTV_CURRENT_PATH = "ltv-normalized/current.json";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// Lit le fichier ltv-normalized/current.json depuis lim-logs (privé) côté serveur
// et renvoie son contenu JSON au frontend de l'éditeur.
export async function GET(): Promise<Response> {
  try {
    const file = await githubGetFile(LTV_CURRENT_PATH, "logs");

    let data: unknown;
    try {
      data = JSON.parse(file.content);
    } catch {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_JSON", message: "current.json n'est pas un JSON valide." } },
        502
      );
    }

    return jsonResponse({ ok: true, data });
  } catch (error) {
    if (error instanceof LigneFtConfigurationError) {
      return jsonResponse(
        { ok: false, error: { code: "CONFIGURATION_ERROR", message: error.message } },
        500
      );
    }

    if (error instanceof LigneFtGithubError) {
      // Inclut le cas "fichier absent" (aucun normalisé encore uploadé par l'app)
      return jsonResponse(
        { ok: false, error: { code: "GITHUB_ERROR", message: error.message, details: error.details } },
        502
      );
    }

    return jsonResponse(
      { ok: false, error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Erreur interne" } },
      500
    );
  }
}
