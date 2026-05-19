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
