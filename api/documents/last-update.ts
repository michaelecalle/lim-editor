import { githubGetLastCommitDate } from "../../src/lib/ligneft/github.js";
import { MANAGED_DOCS } from "../../src/lib/documents.js";
import {
  LigneFtConfigurationError,
  LigneFtGithubError,
} from "../../src/lib/ligneft/errors.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// GET /api/documents/last-update?doc=manuel → { ok, date: ISO | null }
// Date du dernier commit du PDF géré : lim-logs en priorité, sinon repli sur le statique LIM2.
export async function GET(request: Request): Promise<Response> {
  const doc = new URL(request.url).searchParams.get("doc") ?? "";
  const cfg = MANAGED_DOCS[doc];

  if (!cfg) {
    return jsonResponse(
      { ok: false, error: { code: "UNKNOWN_DOC", message: `Document inconnu : ${doc}` } },
      400
    );
  }

  try {
    // 1) Document géré dans lim-logs ?
    let date: string | null = null;
    try {
      date = await githubGetLastCommitDate(cfg.logsPath, "logs");
    } catch {
      date = null;
    }
    // 2) Sinon, repli sur le fichier statique LIM2.
    if (!date) {
      date = await githubGetLastCommitDate(cfg.fallbackPath, cfg.fallbackTarget);
    }
    return jsonResponse({ ok: true, date });
  } catch (error) {
    if (error instanceof LigneFtConfigurationError) {
      return jsonResponse(
        { ok: false, error: { code: "CONFIGURATION_ERROR", message: error.message } },
        500
      );
    }
    if (error instanceof LigneFtGithubError) {
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
