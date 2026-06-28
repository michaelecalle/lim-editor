import { githubGetFileSha, githubPutBinaryFile } from "../../src/lib/ligneft/github.js";
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

// POST /api/documents/publish  { doc: string, fileBase64: string }
// Écrit (ou écrase) le PDF dans lim-logs sous le nom CANONIQUE du document.
export async function POST(request: Request): Promise<Response> {
  let body: { doc?: string; fileBase64?: string };
  try {
    body = (await request.json()) as { doc?: string; fileBase64?: string };
  } catch {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_REQUEST", message: "Corps JSON invalide" } },
      400
    );
  }

  const doc = body?.doc ?? "";
  const fileBase64 = body?.fileBase64 ?? "";
  const cfg = MANAGED_DOCS[doc];

  if (!cfg) {
    return jsonResponse(
      { ok: false, error: { code: "UNKNOWN_DOC", message: `Document inconnu : ${doc}` } },
      400
    );
  }
  if (typeof fileBase64 !== "string" || fileBase64.length === 0) {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_REQUEST", message: "fileBase64 manquant" } },
      400
    );
  }

  try {
    const sha = await githubGetFileSha(cfg.logsPath, "logs"); // null si 1ère publication
    const result = await githubPutBinaryFile(
      cfg.logsPath,
      fileBase64,
      `Mise à jour document « ${doc} » via l'éditeur`,
      sha ?? undefined,
      "logs"
    );
    return jsonResponse({ ok: true, path: result.path, sha: result.sha });
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
