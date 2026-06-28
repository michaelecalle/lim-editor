import { githubGetRawFile } from "../../src/lib/ligneft/github.js";
import { MANAGED_DOCS } from "../../src/lib/documents.js";

// GET /api/documents/get?doc=manuel
// Sert le PDF géré depuis lim-logs. S'il n'y est pas encore publié, redirige vers le
// fichier statique actuel de LIM2 (repli) → l'aperçu n'est jamais vide.
export async function GET(request: Request): Promise<Response> {
  const doc = new URL(request.url).searchParams.get("doc") ?? "";
  const cfg = MANAGED_DOCS[doc];

  if (!cfg) {
    return new Response("Document inconnu", { status: 400 });
  }

  try {
    const bytes = await githubGetRawFile(cfg.logsPath, "logs");
    if (bytes) {
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "no-store",
        },
      });
    }
  } catch {
    // En cas d'erreur de lecture lim-logs, on retombe sur le statique.
  }

  // Pas (encore) dans lim-logs → repli sur le PDF statique LIM2.
  return Response.redirect(cfg.fallbackUrl, 302);
}
