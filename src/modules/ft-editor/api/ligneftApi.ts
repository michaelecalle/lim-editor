import type {
  LigneFtArchivesResponse,
  LigneFtArchiveResponse,
  LigneFtErrorResponse,
  LigneFtPublishRequestBody,
  LigneFtPublishResponse,
} from "../../../types/ligneft-api";

function isErrorResponse(value: unknown): value is LigneFtErrorResponse {
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

export async function fetchLigneFtArchives(): Promise<LigneFtArchivesResponse> {
  const response = await fetch("/api/ligneft/archives", {
    method: "GET",
    cache: "no-store",
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(payload, "Impossible de charger la liste des archives.")
    );
  }

  return payload as LigneFtArchivesResponse;
}

export async function fetchLigneFtArchive(
  name: string
): Promise<LigneFtArchiveResponse> {
  const response = await fetch(
    `/api/ligneft/archive?name=${encodeURIComponent(name)}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(payload, "Impossible de charger l’archive demandée.")
    );
  }

  return payload as LigneFtArchiveResponse;
}

export async function publishLigneFtData(
  data: LigneFtPublishRequestBody["data"]
): Promise<LigneFtPublishResponse> {
  const response = await fetch("/api/ligneft/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      data,
    } satisfies LigneFtPublishRequestBody),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(payload, "Impossible de publier la version courante.")
    );
  }

  return payload as LigneFtPublishResponse;
}