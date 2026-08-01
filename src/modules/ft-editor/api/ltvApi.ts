import type {
  LtvErrorResponse,
  LtvPublishRequestBody,
  LtvPublishResponse,
} from "../../../types/ltv-api";

function isErrorResponse(value: unknown): value is LtvErrorResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    ok?: unknown;
    error?: {
      code?: unknown;
      message?: unknown;
    };
  };

  return (
    candidate.ok === false &&
    typeof candidate.error?.code === "string" &&
    typeof candidate.error?.message === "string"
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("Réponse JSON invalide reçue du serveur.");
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (isErrorResponse(payload)) {
    return payload.error.message;
  }

  return fallback;
}

// Écrit le fichier LTV canonique unique (lim-logs/ltv-normalized/current.json),
// utilisé par l'import PDF de l'onglet LTV. Écrase le fichier vu par LIM et l'éditeur.
export type LtvPublishCurrentResponse = {
  ok: true;
  path: string;
  publishedAt: string;
  rowCount: number;
  warnings: string[];
  // true si le normalisé a été (ré)écrit parce que sa Fecha Vigor était strictement
  // plus récente (ou qu'aucun normalisé n'existait). Sert à piloter le dépôt du PDF.
  written: boolean;
};

export async function publishLtvCurrentFromEditor(
  data: LtvPublishRequestBody["data"]
): Promise<LtvPublishCurrentResponse> {
  const response = await fetch("/api/ltv/publish-current", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ data } satisfies LtvPublishRequestBody),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(payload, "Impossible d'écrire le fichier LTV.")
    );
  }

  return payload as LtvPublishCurrentResponse;
}

// Dépose le PDF source LTV à côté du normalisé (mode secours de LIM). Non bloquant :
// on ignore les erreurs (l'import LTV reste réussi même si ce dépôt échoue). `force`
// suit la décision de date du normalisé (voir publishLtvCurrentFromEditor().written).
export async function publishLtvSourcePdf(
  pdfBase64: string,
  force: boolean
): Promise<void> {
  try {
    await fetch("/api/ltv/publish-current-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ pdfBase64, force }),
    });
  } catch {
    // best-effort : rien à faire, la publication du LTV a déjà réussi.
  }
}

export async function publishLtvNormalizedData(
  data: LtvPublishRequestBody["data"]
): Promise<LtvPublishResponse> {
  const response = await fetch("/api/ltv/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      data,
    } satisfies LtvPublishRequestBody),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(payload, "Impossible de publier les LTV normalisées.")
    );
  }

  return payload as LtvPublishResponse;
}
