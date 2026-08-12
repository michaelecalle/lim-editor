import { githubGetFile } from "../../src/lib/ligneft/github.js";
import { MANAGED_DOCS } from "../../src/lib/documents.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// GET /api/documents/get-page-index?doc=livret-ft
// Sert l'index « numéro de train → page » d'un document géré (lim-logs).
// { ok: true, index: {} } si le document n'a pas d'index déclaré ou pas encore
// publié — jamais d'erreur pour ce cas, l'appelant (LIM, mode secours) doit
// pouvoir se replier sur l'affichage du PDF entier sans page ciblée.
export async function GET(request: Request): Promise<Response> {
  const doc = new URL(request.url).searchParams.get("doc") ?? "";
  const cfg = MANAGED_DOCS[doc];

  if (!cfg) {
    return jsonResponse(
      { ok: false, error: { code: "UNKNOWN_DOC", message: `Document inconnu : ${doc}` } },
      400
    );
  }
  if (!cfg.pageIndexPath) {
    return jsonResponse({ ok: true, index: {} });
  }

  try {
    const file = await githubGetFile(cfg.pageIndexPath, "logs");
    const index = JSON.parse(file.content) as Record<string, number>;
    return jsonResponse({ ok: true, index });
  } catch {
    // Pas encore publié, ou JSON invalide : repli neutre, pas une erreur bloquante.
    return jsonResponse({ ok: true, index: {} });
  }
}
